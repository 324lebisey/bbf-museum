import { neon } from '@neondatabase/serverless';

// ── GroupDashboard.js와 동일한 로직 (일차 계산 + 비활성 판정) ──
const TOTAL_DAYS_BY_MONTH = { '7월': 27, '8월': 26, '9월': 26, '10월': 27, '11월': 23 };
const MONTH_ORDER = ['7월', '8월', '9월', '10월', '11월'];
const SPLIT_GROUPS = new Set([17, 22, 26]);
const ALL_GROUP_IDS = (() => {
  const ids = [];
  for (let i = 1; i <= 91; i++) {
    if (SPLIT_GROUPS.has(i)) ids.push(i + 'A', i + 'B');
    else ids.push(String(i));
  }
  return ids;
})();

function toGlobalIndex(checkDate) {
  const [, mm, dd] = checkDate.split('-').map(Number);
  let idx = 0;
  for (const label of MONTH_ORDER) {
    if (Number(label.replace('월', '')) < mm) idx += TOTAL_DAYS_BY_MONTH[label];
  }
  return idx + dd;
}

function getTodayGlobalIndex() {
  const today = new Date();
  const mm = today.getMonth() + 1;
  let idx = 0;
  for (const label of MONTH_ORDER) {
    const m = Number(label.replace('월', ''));
    if (m < mm) { idx += TOTAL_DAYS_BY_MONTH[label]; continue; }
    if (m === mm) {
      for (let d = 1; d <= today.getDate(); d++) {
        if (new Date(2026, m - 1, d).getDay() !== 0) idx++;
      }
    }
    break;
  }
  return idx;
}

// ── 집계 캐시(서버 메모리): 무거운 전체 풀스캔을 TTL 동안 재사용해 Neon 컴퓨트 절약 ──
// Vercel 서버리스 인스턴스가 살아있는 동안만 유효(콜드스타트 시 자동 초기화).
// 최대 TTL만큼 지연될 수 있으나, 2,000명 규모 집계는 초 단위 실시간일 필요가 없음.
// 쓰기(check/uncheck/register) 시 무효화하지 않음 → 본인 체크는 fetchData(캐시 안 함)로 즉시 반영되고,
// 전체 숫자·모자이크만 최대 TTL 지연됨.
const AGG_CACHE_TTL_MS = 3 * 60 * 1000; // 3분
const globalCache = {};    // { [key]: { at, data } }  key = month || '__ALL__'
const allGroupsCache = {}; // { [month]: { at, data } }

// ── 조별 체크판 잠금 설정 캐시(서버 메모리) ──
// check/uncheck마다 group_settings를 읽으면 쓰기 경로가 2쿼리 → 3쿼리가 된다.
// 잠금 플래그·PIN은 사실상 바뀌지 않으므로 5분 캐싱해 원래 쿼리 수로 되돌린다.
// (SQL로 잠금을 켜고 끄면 최대 5분 뒤 반영됨 — 무해)
// ⚠️ register에서 PIN을 새로 INSERT하면 반드시 무효화할 것.
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const settingsCache = {}; // { [groupId]: { at, row } }

async function getGroupSettings(sql, groupId) {
  const hit = settingsCache[groupId];
  if (hit && Date.now() - hit.at < SETTINGS_CACHE_TTL_MS) return hit.row;
  const rows = await sql`SELECT roster_pin, check_lock FROM group_settings WHERE group_id = ${groupId}`;
  const row = rows[0] || null;
  settingsCache[groupId] = { at: Date.now(), row };
  return row;
}

// 잠금 조에서만 PIN을 요구한다. 잠금이 아니면 무조건 통과 = 기존 동작 그대로.
// MASTER_PIN(환경변수)은 조장 부재 시 운영자가 대신 체크하기 위한 만능키.
// ?admin= 은 클라이언트 값이라 서버가 신뢰할 수 없으므로 여기에 쓰지 않는다.
function verifyCheckPin(row, pin) {
  if (!row || row.check_lock !== true) return true;
  const given = String(pin || '').trim();
  if (!given) return false;
  if (given === row.roster_pin) return true;
  const master = String(process.env.MASTER_PIN || '').trim();
  return Boolean(master) && given === master;
}

export default async function handler(req, res) {
  // Neon 환경변수 체크
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL 환경 변수가 세팅되지 않았습니다.' });
  }

  const sql = neon(process.env.DATABASE_URL);
  const { groupId, global, allGroups, month } = req.query;

  try {
    // 1. 전체 진도율 집계 (이달의 명화 / 150일 대장정용)
    //    - month('2026-08' 형식)가 있으면 그 달의 로그만, 없으면 전체(150일)를 실제로 COUNT.
    //    - 단일 카운터(global_counter) 방식은 폐기 → 중복 클릭으로 숫자가 부풀던 드리프트가 사라짐.
    //    - totalPeople(현재 등록 인원)을 함께 반환 → 프론트에서 분모로 사용, 이탈 시 목표 자동 감소.
   if (global === 'true') {
      const cacheKey = month || '__ALL__';
      const hit = globalCache[cacheKey];
      if (hit && Date.now() - hit.at < AGG_CACHE_TTL_MS) {
        return res.status(200).json(hit.data);
      }

      const peopleResult = await sql`SELECT COUNT(*)::int AS people FROM group_members`;
      const people = peopleResult[0]?.people || 0;

      let count = 0;
      if (month) {
        const prefix = month + '-%';
        const r = await sql`
          SELECT COUNT(*)::int AS c
          FROM tongdok_logs tl
          JOIN group_members gm
            ON gm.group_id = tl.group_id AND gm.name = tl.member_name
          WHERE tl.check_date LIKE ${prefix}
        `;
        count = r[0]?.c || 0;
      } else {
        const r = await sql`
          SELECT COUNT(*)::int AS c
          FROM tongdok_logs tl
          JOIN group_members gm
            ON gm.group_id = tl.group_id AND gm.name = tl.member_name
        `;
        count = r[0]?.c || 0;
      }

      const payload = { globalCount: count, totalPeople: people };
      globalCache[cacheKey] = { at: Date.now(), data: payload };
      return res.status(200).json(payload);
    }

    // 1.5 94개조 모자이크용: 각 조의 이달 진행률을 한 번에 계산해서 반환
    //     GroupDashboard.js의 '우리 조 작품' 계산과 완전히 동일한 로직
    //     (isInactive → activeNames → 진행률) 을 94개 조에 대해 반복
    if (allGroups === 'true') {
      if (!month) {
        return res.status(400).json({ error: 'month 파라미터가 필요합니다. 예: 2026-08' });
      }
      const hit = allGroupsCache[month];
      if (hit && Date.now() - hit.at < AGG_CACHE_TTL_MS) {
        return res.status(200).json(hit.data);
      }
      const mm = Number(month.split('-')[1]);
      const monthLabel = mm + '월';
      const targetDays = TOTAL_DAYS_BY_MONTH[monthLabel];
      if (!targetDays) {
        return res.status(400).json({ error: '알 수 없는 월입니다: ' + monthLabel });
      }
      const monthString = String(mm).padStart(2, '0');

      const allMembers = await sql`SELECT group_id, name FROM group_members`;
      const allLogs = await sql`SELECT group_id, member_name, check_date FROM tongdok_logs`;

      const membersByGroup = {};
      for (const m of allMembers) {
        if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
        membersByGroup[m.group_id].push(m);
      }
      const logsByGroup = {};
      for (const l of allLogs) {
        if (!logsByGroup[l.group_id]) logsByGroup[l.group_id] = [];
        logsByGroup[l.group_id].push(l);
      }

      const groups = ALL_GROUP_IDS.map((gid) => {
        const groupMembers = membersByGroup[gid] || [];
        const groupLogs = logsByGroup[gid] || [];

        // ── 진도율 모집단 = 현재 명단 전체 ([id].js와 동일 규칙) ──
        // 중도탈락자를 DB에서 정리했으므로 뒤처진 사람을 분모에서 빼지 않는다.
        // 활성 멤버(중앙값 기준 5일 이상 뒤처짐 제외) 분모를 쓰던 옛 로직은 아래 주석에 보존.
        // 되살리려면 이 블록을 지우고 주석을 해제할 것 — 단 [id].js §4.4도 함께 되돌려야 한다.
        /*
        const latestByMember = groupMembers.map((m) => {
          const ml = groupLogs.filter((l) => l.member_name === m.name);
          return ml.length > 0 ? Math.max(...ml.map((l) => toGlobalIndex(l.check_date))) : 0;
        });
        const readFrontiers = latestByMember.filter((g) => g > 0).sort((a, b) => a - b);
        const groupFrontier = readFrontiers.length
          ? readFrontiers[Math.floor((readFrontiers.length - 1) / 2)]
          : 0;
        const processed = groupMembers.map((m, i) => {
          const latestGlobal = latestByMember[i];
          let isInactive = false;
          if (latestGlobal > 0) {
            const missed = Math.max(groupFrontier - latestGlobal, 0);
            if (missed >= 5) isInactive = true;
          } else {
            isInactive = true;
          }
          return { name: m.name, isInactive };
        });
        const activeNames = new Set(processed.filter((m) => !m.isInactive).map((m) => m.name));
        */

        const rosterNames = new Set(groupMembers.map((m) => m.name)); // 유령 로그 배제
        const groupTargetGoal = groupMembers.length * targetDays;

        const groupCurrentChecked = groupLogs.filter(
          (l) => rosterNames.has(l.member_name) && l.check_date.includes('-' + monthString + '-')
        ).length;

        const percent = groupTargetGoal > 0
          ? Math.min((groupCurrentChecked / groupTargetGoal) * 100, 100)
          : 0;

        return { groupId: gid, percent: Number(percent.toFixed(1)) };
      });

      const payload = { groups };
      allGroupsCache[month] = { at: Date.now(), data: payload };
      return res.status(200).json(payload);
    }

    if (!groupId) {
      return res.status(400).json({ error: 'GroupId가 필요합니다.' });
    }

    // 2. 데이터 불러오기 (GET)
    if (req.method === 'GET') {
      // 명단은 id(등록순)로, 로그는 날짜순으로 강제 정렬하여 보내줍니다.
      const members = await sql`
        SELECT id, name FROM group_members 
        WHERE group_id = ${groupId} 
        ORDER BY id ASC`;
        
      const logs = await sql`
        SELECT member_name, check_date FROM tongdok_logs 
        WHERE group_id = ${groupId} 
        ORDER BY check_date ASC`;
      
      // 프론트가 체크박스를 잠글지 판단할 플래그. 잠금이 아니면 false.
      const settings = await getGroupSettings(sql, groupId);
      const checkLock = settings ? settings.check_lock === true : false;

      return res.status(200).json({ members, logs, checkLock });
    }

    // 3. 데이터 저장 및 변경 (POST)
    if (req.method === 'POST') {
      const { action } = req.body;

      // [Action A] 조원 명단 등록/갱신
      if (action === 'register') {
        const { names, pin } = req.body;

        // ── 조장 PIN 검증: 이 조의 첫 저장이면 등록, 이후엔 일치해야만 저장 진행 ──
        // (프론트 잠금만으론 API 직접 호출로 우회 가능하므로 반드시 서버에서 검증)
        const trimmedPin = String(pin || '').trim();
        if (trimmedPin.length < 4) {
          return res.status(400).json({ error: 'PIN은 4자리 이상이어야 합니다.' });
        }
        const pinRows = await sql`SELECT roster_pin FROM group_settings WHERE group_id = ${groupId}`;
        if (pinRows.length === 0) {
          await sql`INSERT INTO group_settings (group_id, roster_pin) VALUES (${groupId}, ${trimmedPin})`;
          delete settingsCache[groupId]; // 새 PIN이 캐시에 반영되도록 무효화
        } else if (pinRows[0].roster_pin !== trimmedPin) {
          return res.status(403).json({ error: 'PIN이 일치하지 않습니다. 명단 변경은 조장에게 문의하세요.' });
        }

        // 기존 데이터와 꼬이지 않도록 해당 조의 기존 명단을 초기화 후 재등록 (트랜잭션 대용)
        await sql`DELETE FROM group_members WHERE group_id = ${groupId}`;

        const updatedMembers = [];
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          const id = `${groupId}_${Date.now()}_${i}`;
          await sql`INSERT INTO group_members (id, group_id, name) VALUES (${id}, ${groupId}, ${name})`;
          updatedMembers.push({ id, name });
        }

        return res.status(200).json({ success: true, members: updatedMembers });
      }

      // [Action A-2] 조장 인증만 확인 (체크판 잠금 해제용). DB를 바꾸지 않는다.
      if (action === 'unlock') {
        const settings = await getGroupSettings(sql, groupId);
        if (!settings || settings.check_lock !== true) {
          return res.status(200).json({ ok: true, checkLock: false });
        }
        if (!verifyCheckPin(settings, req.body.pin)) {
          return res.status(403).json({ error: 'PIN이 일치하지 않습니다.', needPin: true });
        }
        return res.status(200).json({ ok: true, checkLock: true });
      }

      // ── 체크판 쓰기 잠금 게이트 ──
      // check_lock = true 인 조만 PIN을 요구한다. 나머지 조는 이 블록을 그대로 통과.
      // 프론트의 disabled는 UX일 뿐이고, 실제 차단은 여기서만 일어난다.
      if (action === 'check' || action === 'uncheck') {
        const settings = await getGroupSettings(sql, groupId);
        if (!verifyCheckPin(settings, req.body.pin)) {
          return res.status(403).json({
            error: '이 조는 조장만 체크할 수 있습니다. 조장 PIN을 입력해 주세요.',
            needPin: true,
          });
        }
      }

      // [Action B] 날짜별 성경통독 체크박스 ON
      // 전체 진도율은 이제 로그를 직접 세므로, 별도 카운터 증가가 필요 없음.
      if (action === 'check') {
        const { name, date } = req.body;

        await sql`
          INSERT INTO tongdok_logs (group_id, member_name, check_date)
          VALUES (${groupId}, ${name}, ${date})
          ON CONFLICT (group_id, member_name, check_date) DO NOTHING
        `;

        const logs = await sql`SELECT member_name, check_date FROM tongdok_logs WHERE group_id = ${groupId}`;
        return res.status(200).json({ success: true, logs });
      }

      // [Action C] 체크박스 OFF (취소)
      if (action === 'uncheck') {
        const { name, date } = req.body;

        await sql`
          DELETE FROM tongdok_logs 
          WHERE group_id = ${groupId} AND member_name = ${name} AND check_date = ${date}
        `;

        const logs = await sql`SELECT member_name, check_date FROM tongdok_logs WHERE group_id = ${groupId}`;
        return res.status(200).json({ success: true, logs });
      }
    }

    return res.status(405).json({ error: '지원하지 않는 메서드입니다.' });

  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: '서버 내부 오류가 발생했습니다.', details: error.message });
  }
}
