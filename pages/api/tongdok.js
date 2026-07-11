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

      return res.status(200).json({ globalCount: count, totalPeople: people });
    }

    // 1.5 94개조 모자이크용: 각 조의 이달 진행률을 한 번에 계산해서 반환
    //     GroupDashboard.js의 '우리 조 작품' 계산과 완전히 동일한 로직
    //     (isInactive → activeNames → 진행률) 을 94개 조에 대해 반복
    if (allGroups === 'true') {
      if (!month) {
        return res.status(400).json({ error: 'month 파라미터가 필요합니다. 예: 2026-08' });
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

      const todayGlobal = getTodayGlobalIndex();
      const isTodayReadingDay = new Date().getDay() !== 0;

      const groups = ALL_GROUP_IDS.map((gid) => {
        const groupMembers = membersByGroup[gid] || [];
        const groupLogs = logsByGroup[gid] || [];

        const processed = groupMembers.map((m) => {
          const memberLogs = groupLogs.filter((l) => l.member_name === m.name);
          let isInactive = false;
          if (memberLogs.length > 0) {
            const latestGlobal = Math.max(...memberLogs.map((l) => toGlobalIndex(l.check_date)));
            const missed = Math.max(todayGlobal - latestGlobal - (isTodayReadingDay ? 1 : 0), 0);
            if (missed >= 5) isInactive = true;
          } else {
            isInactive = true;
          }
          return { name: m.name, isInactive };
        });

        const activeNames = new Set(processed.filter((m) => !m.isInactive).map((m) => m.name));
        const activeCount = activeNames.size;
        const groupTargetGoal = activeCount * targetDays;

        const groupCurrentChecked = groupLogs.filter(
          (l) => activeNames.has(l.member_name) && l.check_date.includes('-' + monthString + '-')
        ).length;

        const percent = groupTargetGoal > 0
          ? Math.min((groupCurrentChecked / groupTargetGoal) * 100, 100)
          : 0;

        return { groupId: gid, percent: Number(percent.toFixed(1)) };
      });

      return res.status(200).json({ groups });
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
      
      return res.status(200).json({ members, logs });
    }

    // 3. 데이터 저장 및 변경 (POST)
    if (req.method === 'POST') {
      const { action } = req.body;

      // [Action A] 조원 명단 등록/갱신
      if (action === 'register') {
        const { names } = req.body;

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
