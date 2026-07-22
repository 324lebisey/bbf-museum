import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

const TOTAL_DAYS_BY_MONTH = {
  '7월': 27, '8월': 26, '9월': 26, '10월': 27, '11월': 23
};
const TOTAL_150_DAYS = 131; 
const LIT_THRESHOLD = 90; // 이 % 이상이면 날짜에 불이 들어옴(거의 전원 통독). 100%는 별도 '완전체' 등급(✓ + 더 밝게)

const ARTWORKS = {
  '150일': 'https://upload.wikimedia.org/wikipedia/commons/1/17/JEAN-FRAN%C3%87OIS_MILLET_-_El_%C3%81ngelus_%28Museo_de_Orsay%2C_1857-1859._%C3%93leo_sobre_lienzo%2C_55.5_x_66_cm%29.jpg',
  '7월': 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
  '8월': '/august.jpg',     
  '9월': '/september.jpg',  
  '10월': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Transfiguration_Raphael.jpg/960px-Transfiguration_Raphael.jpg',
  '11월': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg/3840px-The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg'
};

// ── 일일 통독 범위표 (키: '월-일' 실제 달력 날짜, 주일 제외) ──────────
// 날짜 헤더 호버(PC)/탭(모바일) 시 툴팁으로 표시. 정적 상수라 DB·API 불필요.
const READING_PLAN = {
  // 7월
  '7-1': '창 1-11', '7-2': '창 12-21', '7-3': '창 22-28', '7-4': '창 29-35',
  '7-6': '창 36-42', '7-7': '창 43-50', '7-8': '출 1-7', '7-9': '출 8-15',
  '7-10': '출 16-23', '7-11': '출 24-31', '7-13': '출 32-40', '7-14': '레 1-8',
  '7-15': '레 9-15', '7-16': '레 16-23', '7-17': '레 24-27, 민 1-3', '7-18': '민 4-10',
  '7-20': '민 11-18', '7-21': '민 19-26', '7-22': '민 27-34', '7-23': '민 35-36, 신 1-5',
  '7-24': '신 6-14', '7-25': '신 15-24', '7-27': '신 25-32', '7-28': '신 33-34, 수 1-6',
  '7-29': '수 7-15', '7-30': '수 16-24', '7-31': '삿 1-6',
  // 8월
  '8-1': '삿 7-13', '8-3': '삿 14-21', '8-4': '룻, 삼상 1-4', '8-5': '삼상 5-12',
  '8-6': '삼상 13-19', '8-7': '삼상 20-27', '8-8': '삼상 28-31, 삼하 1-5', '8-10': '삼하 6-13',
  '8-11': '삼하 14-19', '8-12': '삼하 20-24, 왕상 1-2', '8-13': '왕상 3-8', '8-14': '왕상 9-13',
  '8-15': '왕상 14-19', '8-17': '왕상 20-22, 왕하 1-3', '8-18': '왕하 4-10', '8-19': '왕하 11-17',
  '8-20': '왕하 18-25', '8-21': '대상 1-6', '8-22': '대상 7-13', '8-24': '대상 14-23',
  '8-25': '대상 24-29, 대하 1-2', '8-26': '대하 3-11', '8-27': '대하 12-21', '8-28': '대하 22-30',
  '8-29': '대하 31-36', '8-31': '스 1-10',
  // 9월
  '9-1': '느 1-8', '9-2': '느 9-13', '9-3': '에 1-10, 욥 1-3', '9-4': '욥 4-16',
  '9-5': '욥 17-30', '9-7': '욥 31-42', '9-8': '시 1편-24편', '9-9': '시 25편-41편',
  '9-10': '시 42편-60편', '9-11': '시 61편-78편', '9-12': '시 79편-94편', '9-14': '시 95편-110편',
  '9-15': '시 111편-129편', '9-16': '시 130편-150편, 잠 1-3', '9-17': '잠 4-15', '9-18': '잠 16-26',
  '9-19': '잠 27-31, 전 1-7', '9-21': '전 8-12, 아가서', '9-22': '사 1-12', '9-23': '사 13-24',
  '9-24': '사 25-34', '9-25': '사 35-43', '9-26': '사 44-54', '9-28': '사 55-66',
  '9-29': '렘 1-7', '9-30': '렘 8-15',
  // 10월
  '10-1': '렘 16-23', '10-2': '렘 24-31', '10-3': '렘 32-39', '10-5': '렘 40-46',
  '10-6': '렘 47-52', '10-7': '애가, 겔 1-5', '10-8': '겔 6-14', '10-9': '겔 15-21',
  '10-10': '겔 22-29', '10-12': '겔 30-36', '10-13': '겔 37-43', '10-14': '겔 44-48, 단 1-2',
  '10-15': '단 3-9', '10-16': '단 10-12, 호 1-9', '10-17': '호 10-14, 요엘, 암 1-5',
  '10-19': '암 6-9, 오바댜, 요나', '10-20': '미가, 나훔, 하박국, 스바냐', '10-21': '학개, 스가랴 1-12',
  '10-22': '스가랴 13-14, 말라기, 마 1-5', '10-23': '마 6-12', '10-24': '마 13-19',
  '10-26': '마 20-26', '10-27': '마 27-28, 막 1-4', '10-28': '막 5-11', '10-29': '막 12-16',
  '10-30': '눅 1-6', '10-31': '눅 7-11',
  // 11월
  '11-2': '눅 12-17', '11-3': '눅 18-23', '11-4': '눅 24, 요 1-5', '11-5': '요 6-10',
  '11-6': '요 11-16', '11-7': '요 17-21, 행 1-2', '11-9': '행 3-9', '11-10': '행 10-15',
  '11-11': '행 16-22', '11-12': '행 23-28', '11-13': '롬 1-11', '11-14': '롬 12-16, 고전 1-4',
  '11-16': '고전 5-14', '11-17': '고전 15-16, 고후 1-8', '11-18': '고후 9-13, 갈라디아서',
  '11-19': '에베소서, 빌립보서', '11-20': '골로새서, 살전, 살후', '11-21': '딤전, 딤후, 디도서, 빌레몬서',
  '11-23': '히 1-7', '11-24': '히 8-13, 야고보서, 벧전', '11-25': '벧후, 요123, 유다서',
  '11-26': '계 1-12', '11-27': '계 13-22',
};
// ─────────────────────────────────────────────────────

// ── 일차(주일 제외) 유틸 ──────────────────────────────
const MONTH_ORDER = ['7월', '8월', '9월', '10월', '11월'];

// 해당 월의 통독일 실제 날짜 배열 — [i]가 (i+1)일차의 달력 날짜 (주일 제외)
const getReadingDates = (monthLabel) => {
  const m = Number(monthLabel.replace('월', ''));
  const lastDay = new Date(2026, m, 0).getDate();
  const arr = [];
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(2026, m - 1, d);
    if (dt.getDay() !== 0) arr.push(dt); // 주일(0) 제외
  }
  return arr;
};

// 저장된 값('2026-MM-일차')을 프로그램 전체 누적 일차로 변환 (7월 1일차 = 1)
const toGlobalIndex = (checkDate) => {
  const [, mm, dd] = checkDate.split('-').map(Number);
  let idx = 0;
  for (const label of MONTH_ORDER) {
    if (Number(label.replace('월', '')) < mm) idx += TOTAL_DAYS_BY_MONTH[label];
  }
  return idx + dd;
};

// 오늘이 누적 몇 일차인지 (주일이면 직전 통독일까지 센 값)
const getTodayGlobalIndex = () => {
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
};
// ─────────────────────────────────────────────────────

// 실제 운영되는 94개 조 ID 목록. 17·22·26조는 인원이 많아 A/B로 나뉘어 있음
// (예: '17A', '17B') → 총 91개 번호 - 3개(분리) + 6개(A/B) = 94개 방
const SPLIT_GROUPS = new Set([17, 22, 26]);
const ALL_GROUP_IDS = (() => {
  const ids = [];
  for (let i = 1; i <= 91; i++) {
    if (SPLIT_GROUPS.has(i)) {
      ids.push(i + 'A', i + 'B');
    } else {
      ids.push(String(i));
    }
  }
  return ids;
})();

// ── 94개조 모자이크 컴포넌트: 이달의 명화 아래, 조별 진행률을 타일로 표시 ──
const MOSAIC_ROWS = 7;

// 94를 7행에 최대한 고르게 나눔 (예: 14,14,14,13,13,13,13 = 94) → 빈칸 없이 꽉 채움
function buildMosaicRowCounts(total, rows) {
  const base = Math.floor(total / rows);
  const remainder = total - base * rows;
  const counts = [];
  for (let r = 0; r < rows; r++) {
    counts.push(base + (r < remainder ? 1 : 0));
  }
  return counts;
}
const MOSAIC_ROW_COUNTS = buildMosaicRowCounts(94, MOSAIC_ROWS);

function GroupMosaic({ month, paintingSrc, currentGroupId }) {
  const [mosaicGroups, setMosaicGroups] = useState([]);
  const [hoverGroup, setHoverGroup] = useState(null);
  const [tappedGroupId, setTappedGroupId] = useState(null); // 모바일: 1차 탭한 타일

  useEffect(() => {
    if (!month) return;
    fetch(`/api/tongdok?allGroups=true&month=${month}&_cb=${Date.now()}`)
      .then((r) => r.json())
      .then((data) => setMosaicGroups(data.groups || []))
      .catch(() => setMosaicGroups([]));
  }, [month]);

  if (mosaicGroups.length === 0) return null;

  const handleTileClick = (g) => {
    // 1차 탭: 정보만 표시. 같은 타일을 다시 탭하면 그때 이동.
    if (tappedGroupId === g.groupId) {
      window.location.href = `/group/${g.groupId}`;
      return;
    }
    setTappedGroupId(g.groupId);
    setHoverGroup(g);
  };

  let idx = 0;
  let selfPos = null;
  const rows = MOSAIC_ROW_COUNTS.map((colCount, rowIdx) => {
    const items = Array.from({ length: colCount }).map((_, colIdx) => {
      const g = mosaicGroups[idx];
      idx += 1;
      if (g && String(g.groupId) === String(currentGroupId)) {
        selfPos = { rowIdx, colIdx, colCount };
      }
      return { g, colIdx };
    });
    return { colCount, items };
  });

  const displayGroup = hoverGroup;

  return (
    <div className="mt-12">
      <div className="w-full max-w-xs mx-auto border-t border-[#27272A] mb-8" />
      <div className="text-[15px] font-bold text-[#52525B] font-mono tracking-widest uppercase mb-3 text-center">
        94개조 진행 현황
      </div>
      <div
        className="relative w-full rounded-xl overflow-hidden border border-[#27272A] flex flex-col"
        style={{ aspectRatio: '16/9', background: '#000' }}
        onMouseLeave={() => { setHoverGroup(null); }}
      >
        {rows.map(({ colCount, items }, rowIdx) => (
          <div key={rowIdx} className="flex" style={{ flex: 1 }}>
            {items.map(({ g, colIdx }) => {
              if (!g) return null;
              const pct = g.percent;
              const isZero = pct <= 0;
              const bgPosX = colCount > 1 ? (colIdx / (colCount - 1)) * 100 : 0;
              const bgPosY = MOSAIC_ROWS > 1 ? (rowIdx / (MOSAIC_ROWS - 1)) * 100 : 0;

              return (
                <div
                  key={g.groupId}
                  onMouseEnter={() => setHoverGroup(g)}
                  onClick={() => handleTileClick(g)}
                  className="relative cursor-pointer"
                  style={{
                    flex: 1,
                    border: '0.5px solid rgba(0,0,0,0.5)',
                    background: isZero ? '#050505' : undefined,
                    backgroundImage: isZero ? 'none' : `url(${paintingSrc})`,
                    backgroundSize: isZero ? undefined : `${colCount * 100}% ${MOSAIC_ROWS * 100}%`,
                    backgroundPosition: isZero ? undefined : `${bgPosX}% ${bgPosY}%`,
                    filter: isZero ? 'none' : `grayscale(${100 - pct}%) brightness(${0.55 + pct / 250})`,
                  }}
                />
              );
            })}
          </div>
        ))}

        {selfPos && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${(selfPos.colIdx / selfPos.colCount) * 100}%`,
              top: `${(selfPos.rowIdx / MOSAIC_ROWS) * 100}%`,
              width: `${(1 / selfPos.colCount) * 100}%`,
              height: `${(1 / MOSAIC_ROWS) * 100}%`,
              border: '3px solid #FFB366',
              boxShadow: '0 0 12px 2px rgba(255,179,102,0.9), inset 0 0 8px 1px rgba(255,179,102,0.5)',
              zIndex: 10,
            }}
          />
        )}
      </div>

      <div className="h-8 text-center mt-2">
        {displayGroup && (
          <span>
            <span style={{ fontSize: '17px' }} className="font-bold text-[#D4D4D8]">{displayGroup.groupId}조</span>
            <span style={{ fontSize: '17px' }} className="text-[#52525B]"> · </span>
            <span style={{ fontSize: '22px' }} className="font-black text-[#E67E22]">{displayGroup.percent}%</span>
          </span>
        )}
      </div>
      {tappedGroupId && (
        <div className="text-center text-[15px] text-[#52525B] mt-1">
          한 번 더 탭하면 {tappedGroupId}조로 이동합니다
        </div>
      )}
    </div>
  );
}

export default function GroupDashboard() {
  const router = useRouter();
  const { id: queryId } = router.query;

  // ── 명단표: 헤더/본문 가로 스크롤 동기화용 ref (반드시 컴포넌트 내부에 있어야 Hook 규칙 준수) ──
  const headerScrollRef = useRef(null);
  const bodyScrollRef = useRef(null);
  const handleBodyScroll = () => {
    if (headerScrollRef.current && bodyScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
    setReadingTip(null); // 가로 스크롤 시 툴팁 위치가 어긋나므로 닫음
  };
  const NAME_COL_WIDTH = 88; // 한글 4글자 + 좌우 패딩에 딱 맞는 폭
  const DAY_COL_WIDTH = 48;

  const [activeTab, setActiveTab] = useState('우리 조 작품');
  const [currentMonth, setCurrentMonth] = useState('7월');
  const [selectedGroupToggle, setSelectedGroupToggle] = useState('');
  
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allGroupsLogsCount, setAllGroupsLogsCount] = useState(0);
  const [totalPeople, setTotalPeople] = useState(0); // 현재 등록 인원(분모). 이탈하면 자동으로 줄어듦

  // ── 통독 범위 툴팁: { i, x, y, text, pinned } ──
  // PC: 호버로 표시/이탈로 숨김. 모바일: 탭하면 고정(pinned), 같은 날짜 다시 탭하면 닫힘.
  const [readingTip, setReadingTip] = useState(null);

  const groupId = queryId; 

  // 현재 탭·월에 맞는 global 조회용 월 파라미터 (150일 대장정이면 null → 전체 집계)
  const currentMonthParam = () =>
    activeTab === '150일 대장정' ? null : '2026-' + currentMonth.replace('월', '').padStart(2, '0');

  // 조 번호가 정해지면 우리 조 데이터 로드
  useEffect(() => {
    if (groupId) {
      setSelectedGroupToggle(groupId);
      fetchData(groupId);
    }
  }, [groupId]);

  // 최초 로드 + 탭 전환 + 월 전환 시, 전체 진도율을 해당 월 기준으로 다시 집계
  useEffect(() => {
    if (groupId) fetchGlobalProgress(currentMonthParam());
  }, [groupId, activeTab, currentMonth]);

  // 월·탭이 바뀌면 열려있던 통독 범위 툴팁을 닫음 (날짜가 달라져 내용이 어긋나므로)
  useEffect(() => {
    setReadingTip(null);
  }, [currentMonth, activeTab]);

  // 창으로 돌아올 때(그새 다른 조가 체크했을 수 있으니) 최신화
  useEffect(() => {
    const onFocus = () => {
      if (!groupId) return;
      fetchGlobalProgress(currentMonthParam());
      fetchData(groupId);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [groupId, activeTab, currentMonth]);

  // 모든 명화를 미리 로드해 캐시에 넣어둠 → 탭/월 전환 시 그림이 즉시 바뀜
  useEffect(() => {
    Object.values(ARTWORKS).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, []);

  const fetchData = async (targetGroupId) => {
    if (!targetGroupId) return;
    const res = await fetch(`/api/tongdok?groupId=${targetGroupId}&_cb=${Date.now()}`);
    if (res.ok) {
      const result = await res.json();
      // 명단 순서를 고정하고, 상태를 업데이트합니다.
      setMembers([...result.members]); 
      setLogs(result.logs || []);
      // 우리 조 데이터일 때만, 입력창이 비어 있으면 현재 명단으로 채워줌
      // → PIN 등록·조원 한 명 추가 등에 전체 재입력이 필요 없어짐.
      //   (타 조 갤러리 순회 데이터로는 절대 채우지 않음 / 입력 중인 내용은 덮어쓰지 않음)
      if (String(targetGroupId) === String(groupId)) {
        const currentNames = result.members.map(m => m.name).join(', ');
        setMemberInput(prev => (prev.trim() === '' ? currentNames : prev));
      }
    }
  };

  // 월 파라미터를 받아 해당 월(또는 150일 전체) 전 조 집계 + 현재 등록 인원을 함께 받아옴
  const fetchGlobalProgress = async (month) => {
    const q = month ? `&month=${month}` : '';
    const res = await fetch(`/api/tongdok?global=true${q}&_cb=${Date.now()}`);
    const result = await res.json();
    setAllGroupsLogsCount(result.globalCount || 0);
    setTotalPeople(result.totalPeople || 0);
  };

  const handleRegisterMembers = async () => {
    // 조 번호(groupId)가 비어있거나 인식이 안 되었으면 즉시 중단합니다.
    if (!groupId) {
      alert("조 번호(ID)를 주소창에서 아직 읽어오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    
    if (!memberInput.trim()) return;
    if (!confirm(`${groupId}조 명단을 변경하시겠습니까? 기존 기록은 이름이 일치하면 유지됩니다.`)) return;

    // ── 조장 PIN: 이 조의 첫 저장이면 지금 입력한 PIN이 등록되고, 이후엔 일치해야만 저장됨 ──
    const pin = window.prompt('조장 PIN을 입력하세요 (4자리 이상).\n※ 이 조의 첫 저장이라면 지금 입력한 PIN이 조장 PIN으로 등록됩니다. 조장님만 알고 계세요!');
    if (pin === null) return; // 취소
    if (pin.trim().length < 4) {
      alert('PIN은 4자리 이상이어야 합니다.');
      return;
    }
    
    const nameList = memberInput.split(',').map(n => n.trim()).filter(n => n !== '');
    
    const response = await fetch(`/api/tongdok?groupId=${groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', names: nameList, pin: pin.trim() })
    });

    if (response.ok) {
      alert('명단이 성공적으로 저장되었습니다!');
      await fetchData(groupId);
      await fetchGlobalProgress(currentMonthParam());
    } else {
      const errData = await response.json();
      alert(`명단 저장 실패: ${errData.error || '알 수 없는 오류'}`);
    }
  };

  const handleCheckboxToggle = async (memberName, dateStr, isChecked) => {
    if (!groupId) return;

    try {
      const response = await fetch(`/api/tongdok?groupId=${groupId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: isChecked ? 'check' : 'uncheck', 
          name: memberName, 
          date: dateStr 
        })
      });

      if (response.ok) {
        await fetchData(groupId);
        await fetchGlobalProgress(currentMonthParam());
      } else {
        alert("저장에 실패했습니다.");
      }
    } catch (err) {
      console.error("체크박스 통신 오류:", err);
    }
  };

  const handleGroupToggleChange = (e) => {
    const target = e.target.value;
    setSelectedGroupToggle(target);
    fetchData(target);
  };

  // ── 비활성 판정: '오늘 날짜'가 아니라 '조가 실제 도달한 지점(중앙값)' 기준 ──
  const todayGlobal = getTodayGlobalIndex(); // 헤더의 '미래 날짜' 판정용(달력 기준)
  // ※ 다 같이 늦은 조는 아무도 이탈 처리되지 않고(→ 진도율 0% 붕괴 방지),
  //   일부만 뒤처지면 그 사람만 분모에서 빠져 남은 인원이 100% 달성 가능.
  //   중앙값이라 빠른 1~2명 때문에 나머지가 통째로 이탈 처리되는 일도 없음.
  //   isInactive 계산 자체는 진도율(§4.4 동일 모집단)·모자이크에 계속 쓰이므로 제거 금지.
  const _latestByMember = members.map(m => {
    const ml = logs.filter(l => l.member_name === m.name);
    return ml.length > 0 ? Math.max(...ml.map(l => toGlobalIndex(l.check_date))) : 0;
  });
  const _read = _latestByMember.filter(g => g > 0).sort((a, b) => a - b);
  const groupFrontier = _read.length ? _read[Math.floor((_read.length - 1) / 2)] : 0; // 조 중앙 도달 일차

  const processedMembers = members.map((m, i) => {
    const latestGlobal = _latestByMember[i];
    let isInactive = false;
    if (latestGlobal > 0) {
      const missed = Math.max(groupFrontier - latestGlobal, 0); // 조 중앙값 대비 뒤처진 일차 수
      if (missed >= 5) isInactive = true;
    } else {
      isInactive = true; // 로그가 아예 없으면 비활성
    }
    return { ...m, isInactive };
  });
  // [비활성 하단 정렬 — 임시 비활성화. 되살리려면 위 `});`를 지우고 아래 주석을 해제]
  // }).sort((a, b) => a.isInactive - b.isInactive);

  const activeMemberCount = processedMembers.filter(m => !m.isInactive).length;
  const targetDays = TOTAL_DAYS_BY_MONTH[currentMonth] || 30;
  const groupTargetGoal = activeMemberCount * targetDays;
  
  const monthString = currentMonth.replace('월', '').padStart(2, '0');
  const activeNames = new Set(processedMembers.filter(m => !m.isInactive).map(m => m.name));
  const groupCurrentChecked = logs.filter(
    l => activeNames.has(l.member_name) && l.check_date.includes('-' + monthString + '-')
  ).length;

  // ── 일차별 헤더 %: 그날을 '현재 명단 전체' 중 몇 %가 체크했는지 ──
  // ※ 분모 = 현재 명단 전체(rosterCount). 화면에 보이는 체크 수와 % 숫자가 정확히 일치한다.
  //   - 전원 체크 → 100%✓ (full=true, '완전체')
  //   - 한두 명 빠져도 90% 이상이면 점등(LIT_THRESHOLD) → 뒤처진 인원이 축하를 막지 않음
  //   - 반올림이 100으로 튀어 '가짜 100%'가 되는 것 방지: 진짜 전원(full)일 때만 100 표기
  //   (누적 진도율 §4.4·모자이크는 별개 — activeNames/중앙값 기준 그대로)
  const rosterNames = new Set(members.map(m => m.name)); // 유령 로그 배제(현재 명단만)
  const rosterCount = members.length;
  const dailyCounts = {};
  logs.forEach(l => {
    if (!rosterNames.has(l.member_name)) return;
    if (!l.check_date.includes('-' + monthString + '-')) return;
    dailyCounts[l.check_date] = (dailyCounts[l.check_date] || 0) + 1;
  });
  const getDayInfo = (dateStr) => {
    if (rosterCount === 0) return { pct: 0, full: false };
    const checked = dailyCounts[dateStr] || 0;
    const full = checked >= rosterCount;                                  // 전원 체크한 날만 진짜 100%
    const pct = full ? 100 : Math.min(Math.round((checked / rosterCount) * 100), 99);
    return { pct, full };
  };

  // 주간 구분선용: [i] = (i+1)일차의 실제 달력 날짜
  const readingDates = getReadingDates(currentMonth);

  // ── 통독 범위 툴팁 핸들러 ──────────────────────────────
  // 위치는 position:fixed 기준(뷰포트 좌표)이라 sticky 헤더의 overflow 클리핑에 안 잘림.
  const buildReadingTip = (e, i) => {
    const d = readingDates[i];
    if (!d) return null;
    const passage = READING_PLAN[(d.getMonth() + 1) + '-' + d.getDate()];
    if (!passage) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const half = 110; // 툴팁 절반 폭 추정치 — 화면 가장자리 밖으로 안 나가게 클램프
    const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half);
    return { i, x, y: rect.bottom, text: (d.getMonth() + 1) + '/' + d.getDate() + ' · ' + passage };
  };
  const handleTipEnter = (e, i) => {
    const tip = buildReadingTip(e, i);
    if (tip) setReadingTip({ ...tip, pinned: false });
  };
  const handleTipLeave = () => {
    setReadingTip(prev => (prev && prev.pinned ? prev : null));
  };
  // 모바일: 첫 탭 = mouseenter+click이 같이 발생 → click이 pinned로 승격(계속 표시).
  //         같은 날짜 두 번째 탭 = click만 발생 → pinned 상태면 닫음.
  const handleTipClick = (e, i) => {
    const tip = buildReadingTip(e, i);
    setReadingTip(prev => {
      if (prev && prev.i === i && prev.pinned) return null;
      return tip ? { ...tip, pinned: true } : null;
    });
  };
  // ─────────────────────────────────────────────────────

  let progressPercent = 0;
  if (activeTab === '우리 조 작품') {
    progressPercent = groupTargetGoal > 0 ? ((groupCurrentChecked / groupTargetGoal) * 100) : 0;
  } else if (activeTab === '이달의 명화 전시관') {
    // 분모 = 현재 등록 인원 × 그달 일수. totalPeople 로딩 전에는 0으로 안전 처리
    const goal = totalPeople * targetDays;
    progressPercent = goal > 0 ? (allGroupsLogsCount / goal) * 100 : 0;
  } else {
    // 150일 대장정: 분모 = 현재 등록 인원 × 150일치
    const goal = totalPeople * TOTAL_150_DAYS;
    progressPercent = goal > 0 ? (allGroupsLogsCount / goal) * 100 : 0;
  }
  progressPercent = Math.min(Number(progressPercent), 100).toFixed(1);
  const isComplete = activeTab === '우리 조 작품' && Number(progressPercent) >= 100;
  const getMaskStyle = (percent) => {
    if (Number(percent) === 0) return { WebkitMaskImage: 'none', maskImage: 'none', opacity: 0 };
    let maskValue = '';

    if (activeTab === '150일 대장정') {
      // 중앙 아래(50% 68%)에서 진행률만큼 작게 시작 → 서서히 커짐
      const core = Number(percent);   // 완전 밝은 반경 (진행률 1:1)
      const edge = core + 5;          // 페이드 폭 (작을수록 시작 빛이 더 작음)
      maskValue = 'radial-gradient(circle at 50% 68%, rgba(0,0,0,1) ' + core + '%, rgba(0,0,0,0) ' + edge + '%)';
    } else {
      switch(currentMonth) {
        case '7월': {
          // 맞닿은 손끝 사이(38% 47%)에서 아주 작게 시작 → 진행률만큼 선형으로 커짐
          // (아담 손=35%, 하나님 손=41% 사이 정중앙 38%: 두 손끝이 맞닿는 지점)
          const jCore = Math.pow(Number(percent) / 100, 1.4) * 100;
          const jEdge = jCore + 5;          // 페이드 폭 (작을수록 시작 원이 더 조여짐)
          maskValue = 'radial-gradient(circle at 38% 47%, rgba(0,0,0,1) ' + jCore + '%, rgba(0,0,0,0) ' + jEdge + '%)';
          break;
        }
        case '8월': {
          // 아기 예수(18% 67%)에서 작고 희미하게 시작 → 서서히 커짐
          const aCore = Number(percent);                 // 완전 밝은 반경 (진행률 1:1)
          const aEdge = aCore + 4;                        // 페이드 폭 (작을수록 시작이 더 작음)
          const peak = Math.min(1, Number(percent) / 6);  // 6%까진 반투명(희미), 이후 완전
          maskValue = 'radial-gradient(circle at 18% 67%, rgba(0,0,0,' + peak + ') ' + aCore + '%, rgba(0,0,0,0) ' + aEdge + '%)';
          break;
        }
        case '9월': {
          // 좌하단→우상단 대각선으로 차오름. 초반 면적은 페이드 폭(+5)이 결정
          const level = Math.pow(Number(percent) / 100, 1.8) * 100; // 차오르는 정도(지수 클수록 느림)
          const band = level + 5;
          maskValue = 'linear-gradient(315deg, rgba(0,0,0,1) ' + level + '%, rgba(0,0,0,0) ' + band + '%)';
          break;
        }
        case '10월': {
          // 밑에서 위로 차오름. 초반 밝은 면적의 진짜 원인은 페이드 폭이라 15 → 3으로 축소.
          const level = Math.pow(Number(percent) / 100, 1.8) * 100; // 차오르는 높이(지수 클수록 느림)
          const band = level + 3; // ★ 이 값이 '0.2%일 때 밝은 면적'을 좌우함
          maskValue = 'linear-gradient(0deg, rgba(0,0,0,1) ' + level + '%, rgba(0,0,0,0) ' + band + '%)';
          break;
        }
        case '11월': {
          // 가장자리부터 진행률만큼 '밝음 경계'가 바깥→안쪽으로 선형 이동 (매일 일정하게 변화)
          const boundary = 100 - Number(percent); // 진행 0→100%, 경계 100→0%
          const soft = 4;                          // 어둠→밝음 전환 폭
          const inner = Math.max(boundary - soft, 0);
          maskValue =
            'radial-gradient(circle at 50% 50%, ' +
            'rgba(0,0,0,0) 0%, ' +
            'rgba(0,0,0,0) ' + inner + '%, ' +
            'rgba(0,0,0,1) ' + boundary + '%, ' +
            'rgba(0,0,0,1) 100%)';
          break;
        }
        default:
          maskValue = 'radial-gradient(circle at 50% 50%, rgba(0,0,0,1) ' + Number(percent) + '%, rgba(0,0,0,0) ' + (Number(percent) + 10) + '%)';
      }
    }
    return { WebkitMaskImage: maskValue, maskImage: maskValue, opacity: 1 };
  };

  const isLargeMonth = activeTab !== '150일 대장정' && ['7월', '8월', '9월', '11월'].includes(currentMonth);
  const isOctober = activeTab !== '150일 대장정' && currentMonth === '10월';

  // ── A/B 분리조 진입 차단 ──────────────────────────────
  // 17·22·26조는 A/B로만 운영되므로, 접미사 없는 맨숫자(?id=17 등)로 들어오면 진입을 막고
  // A/B 중 하나를 고르도록 안내한다. (문자열 그대로 비교 — Number() 강제변환 금지)
  const isBlockedSplitGroup = groupId != null && SPLIT_GROUPS.has(Number(groupId)) && /^\d+$/.test(String(groupId));

  if (isBlockedSplitGroup) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] text-[#E4E4E7] p-4 md:p-8 font-sans antialiased flex items-center justify-center">
        <div className="max-w-md w-full bg-[#121215] rounded-2xl border border-[#1F1F23] shadow-2xl p-8 text-center">
          <div className="text-4xl mb-4">🚧</div>
          <h1 className="text-xl font-black text-[#F3F4F6] mb-3">{groupId}조는 A / B로 나뉘어 있어요</h1>
          <p className="text-sm text-[#A1A1AA] leading-relaxed mb-6">
            인원이 많아 <span className="text-[#E67E22] font-bold">{groupId}A조</span>와 <span className="text-[#E67E22] font-bold">{groupId}B조</span>로 운영됩니다.<br />
            아래에서 본인의 방을 선택해 주세요.
          </p>
          <div className="flex gap-3 justify-center">
            <a href={`/group/${groupId}A`} className="flex-1 bg-[#E67E22] hover:bg-[#D35400] text-white px-5 py-3 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-[#E67E22]/10">
              {groupId}A조로 입장
            </a>
            <a href={`/group/${groupId}B`} className="flex-1 bg-[#E67E22] hover:bg-[#D35400] text-white px-5 py-3 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-[#E67E22]/10">
              {groupId}B조로 입장
            </a>
          </div>
        </div>
      </div>
    );
  }
  // ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#E4E4E7] p-4 md:p-8 font-sans antialiased selection:bg-[#E67E22]/30">
      <div className="max-w-5xl mx-auto">
        
        <header className="text-center mb-10 pt-4">
          <span className="text-xs font-semibold tracking-widest text-[#E67E22] uppercase border border-[#E67E22]/30 px-3 py-1 rounded-full bg-[#E67E22]/5">Bible Blessing Fellowship</span>
          <h1 className="text-3xl md:text-4xl font-black text-[#F3F4F6] mt-4 tracking-tight">BBF 3기 성경통독 박물관</h1>
          <p className="text-sm text-[#71717A] mt-2 font-medium">{groupId}조 대시보드 — 말씀으로 완성되는 아름다운 명화 갤러리</p>
        </header>

        <div className="flex justify-center gap-1 mb-6 bg-[#121215] p-1.5 rounded-xl border border-[#1F1F23] max-w-md mx-auto">
          {['150일 대장정', '이달의 명화 전시관', '우리 조 작품'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={'flex-1 text-center py-2 text-xs md:text-sm font-bold rounded-lg transition-all ' + (activeTab === tab ? 'bg-[#E67E22] text-white shadow-lg' : 'text-[#71717A] hover:text-[#A1A1AA]')}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab !== '150일 대장정' && (
          <div className="flex justify-center gap-1.5 mb-8 bg-[#121215]/50 p-1 rounded-lg border border-[#1F1F23]/60 max-w-xs mx-auto">
            {Object.keys(TOTAL_DAYS_BY_MONTH).map(m => (
              <button
                key={m}
                onClick={() => setCurrentMonth(m)}
                className={'flex-1 text-center py-1 text-xs font-bold rounded transition-all ' + (currentMonth === m ? 'bg-[#27272A] text-[#E67E22] border border-[#E67E22]/30' : 'text-[#52525B] hover:text-[#A1A1AA]')}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {activeTab === '우리 조 작품' && (
          <div className="flex justify-end items-center gap-2 mb-4">
            <span className="text-xs text-[#52525B]">타 조 갤러리 순회:</span>
            <select value={selectedGroupToggle} onChange={handleGroupToggleChange} className="bg-[#121215] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs text-[#A1A1AA] focus:outline-none focus:border-[#E67E22]">
              {ALL_GROUP_IDS.map((gid) => (
                <option key={gid} value={gid}>{gid}조 갤러리</option>
              ))}
            </select>
          </div>
        )}

        {/* 10월 확대 시 짤림을 막기 위해 컨테이너 패딩 가변 조정 */}
        <div className={'bg-[#121215] rounded-2xl border border-[#1F1F23] mb-8 text-center shadow-2xl relative transition-all duration-300 ' + (isOctober ? 'p-10 md:p-12' : 'p-5 md:p-8')}>
          
          {/* 원래 비율은 사수하되, 10월 선택 시에만 scale-110으로 그림을 10% 증폭 */} 
          <div
            className={'relative mx-auto rounded-xl overflow-hidden border inline-block transition-all duration-300 ' + (isOctober ? 'max-w-5xl transform scale-110 shadow-2xl' : isLargeMonth ? 'max-w-5xl' : 'max-w-2xl') + (isComplete ? ' border-[#FFB366]' : ' border-[#27272A]')}
            style={isComplete ? {
              boxShadow: '0 0 40px 8px rgba(255,179,102,0.55), 0 0 90px 20px rgba(255,179,102,0.25)',
              animation: 'paintingGlowPulse 2.4s ease-in-out infinite',
            } : undefined}
          >  
            <img 
              src={ARTWORKS[activeTab === '150일 대장정' ? '150일' : currentMonth]} 
              alt="Museum Base"
              className="w-full h-auto max-h-[80vh] object-contain filter grayscale brightness-[15%] block transition-all duration-300"
            />
            
            <img 
              src={ARTWORKS[activeTab === '150일 대장정' ? '150일' : currentMonth]} 
              alt="Museum Color"
              style={getMaskStyle(progressPercent)}
              className="absolute inset-0 w-full h-full object-contain filter brightness(115%) contrast(105%) block transition-all duration-300"
            />

          </div>
          {/* 그림이 확대되었을 때 수치 마진이 겹치지 않도록 간격 최적화 */}
          <div className={'text-[15px] text-[#52525B] font-bold tracking-widest uppercase transition-all ' + (isOctober ? 'mt-10' : 'mt-6')}>
            {activeTab === '우리 조 작품' ? selectedGroupToggle + '조 ' + currentMonth + ' 진도율' : activeTab + ' 진척도'}
          </div>
          <div className="text-5xl font-black text-[#E67E22] mt-1 tracking-tighter">{progressPercent}%</div>

          {activeTab === '이달의 명화 전시관' && (
            <GroupMosaic
              month={'2026-' + currentMonth.replace('월', '').padStart(2, '0')}
              paintingSrc={ARTWORKS[currentMonth]}
              currentGroupId={groupId}
            />
          )}
        </div>

        {activeTab === '우리 조 작품' && String(selectedGroupToggle) === String(groupId) && (
          <div className="bg-[#121215] p-6 rounded-2xl border border-[#1F1F23] shadow-xl">
            <div className="mb-4">
              <h3 className="text-base font-bold text-[#F4F4F5] flex items-center gap-2">
                <span>{groupId}조의 성경통독</span>
                <span className="text-xs text-[#E67E22] bg-[#E67E22]/10 px-2 py-0.5 rounded-full font-medium">{currentMonth} 체크판</span>
              </h3>
            </div>
            
            <div className="flex gap-2 mb-6">
              <input type="text" value={memberInput} onChange={(e) => setMemberInput(e.target.value)} placeholder="조원 이름을 쉼표로 구분하여 입력 (예: 최경미, 이지민, 홍길동)" className="flex-1 bg-[#18181C] border border-[#27272A] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#E67E22] placeholder:text-[#3F3F46]" />
              <button onClick={handleRegisterMembers} className="bg-[#E67E22] hover:bg-[#D35400] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-[#E67E22]/10">명단 저장</button>
            </div>

            {/* 통독 범위 툴팁 사용 안내 — 글자 크기: text-xs(12px)에서 20% 키운 14.4px */}
            <div className="mb-3 flex items-center gap-1.5 text-[#71717A]" style={{ fontSize: '14.4px' }}>
              <span>📖</span>
              <span>날짜를 탭하면 그날의 통독 범위를 확인할 수 있어요. 한번 더 탭하면 닫혀요. (PC에서는 마우스를 올리면 보여요.)</span>
            </div>

            <div className="rounded-xl border border-[#1F1F23] bg-[#0E0E11]">
              {/* 날짜 헤더 — 별도 div, sticky top-0으로 페이지(뷰포트) 스크롤 기준 고정.
                  ※ 부모에 overflow-hidden/auto가 있으면 sticky가 그 박스에 갇혀 무효화되므로 절대 넣지 말 것. */}
              <div ref={headerScrollRef} className="overflow-x-hidden sticky top-0 z-20 bg-[#141416] rounded-t-xl">
                <table style={{ tableLayout: 'fixed', width: NAME_COL_WIDTH + targetDays * DAY_COL_WIDTH }} className="text-sm text-center">
                  <colgroup>
                    <col style={{ width: NAME_COL_WIDTH }} />
                    {Array.from({ length: targetDays }).map((_, i) => <col key={i} style={{ width: DAY_COL_WIDTH }} />)}
                  </colgroup>
                  <thead>
                    <tr className="bg-[#141416] text-[#52525B] border-b border-[#1F1F23] text-sm font-bold">
                      <th className="py-3 px-4 text-left sticky left-0 bg-[#141416] text-[#A1A1AA] z-30 border-r border-[#1F1F23] whitespace-nowrap">이름</th>
                      {Array.from({ length: targetDays }).map((_, i) => {
                        const isWeekEnd = readingDates[i] && readingDates[i].getDay() === 6;
                        const displayDate = readingDates[i] ? readingDates[i].getDate() : i + 1;
                        const dayKey = '2026-' + monthString + '-' + String(i + 1).padStart(2, '0');
                        const isFutureDay = toGlobalIndex(dayKey) > todayGlobal;
                        const { pct: dayPct, full: isFullColumn } = getDayInfo(dayKey);
                        const isPerfect = !isFutureDay && isFullColumn;                   // 전원 체크 → 완전체
                        const isLit = !isFutureDay && dayPct >= LIT_THRESHOLD;            // 90% 이상 점등
                        return (
                          <th
                            key={i}
                            onMouseEnter={(e) => handleTipEnter(e, i)}
                            onMouseLeave={handleTipLeave}
                            onClick={(e) => handleTipClick(e, i)}
                            className={'py-3 px-2 font-mono text-[#71717A] cursor-pointer select-none' + (isWeekEnd ? ' border-r border-[#33333A]' : '')}
                          >
                            <div style={isLit ? { color: '#FFD700', textShadow: isPerfect
                                ? '0 0 6px rgba(255,215,0,0.9), 0 0 14px rgba(255,179,102,0.6), 0 0 24px rgba(255,179,102,0.35)'
                                : '0 0 5px rgba(255,215,0,0.5), 0 0 11px rgba(255,179,102,0.3)' } : undefined}>{displayDate}</div>
                            <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: isLit ? 700 : 400, color: isLit ? '#FFD700' : '#52525B' }}>
                              {isFutureDay ? '\u00A0' : dayPct + '%' + (isPerfect ? '✓' : '')}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                </table>
              </div>

              {/* 표 본문 — 가로 스크롤은 여기서만, 세로는 페이지 스크롤 그대로 */}
              <div ref={bodyScrollRef} onScroll={handleBodyScroll} className="overflow-x-auto rounded-b-xl">
                <table style={{ tableLayout: 'fixed', width: NAME_COL_WIDTH + targetDays * DAY_COL_WIDTH }} className="text-sm text-center">
                  <colgroup>
                    <col style={{ width: NAME_COL_WIDTH }} />
                    {Array.from({ length: targetDays }).map((_, i) => <col key={i} style={{ width: DAY_COL_WIDTH }} />)}
                  </colgroup>
                  <tbody className="divide-y divide-[#1F1F23]">
                    {processedMembers.map((member) => (
                      /* [비활성 흐림 처리 — 임시 비활성화]
                         되살리려면 아래 tr의 className을 다음으로 교체:
                         className={'hover:bg-[#18181C]/50 transition-all ' + (member.isInactive ? 'opacity-30 bg-black/40' : '')} */
                      <tr key={member.id} className="hover:bg-[#18181C]/50 transition-all">
                        <td className="py-3 px-4 font-bold text-left text-sm text-[#D4D4D8] sticky left-0 bg-[#121215] border-r border-[#1F1F23] z-10 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {member.name}
                            {/* [비활성 💤 아이콘 — 임시 비활성화. 되살리려면 주석 해제]
                            {member.isInactive && <span title="5일 이상 미체크">💤</span>}
                            */}
                          </span>
                        </td>
                        {Array.from({ length: targetDays }).map((_, i) => {
                          const dateStr = '2026-' + monthString + '-' + String(i + 1).padStart(2, '0');
                          const isChecked = logs.some(l => l.member_name === member.name && l.check_date === dateStr);
                          const isWeekEnd = readingDates[i] && readingDates[i].getDay() === 6;
                          return (
                            <td key={i} className={'py-3 px-2' + (isWeekEnd ? ' border-r border-[#33333A]' : '')}>
                              <input type="checkbox" checked={isChecked} onChange={(e) => handleCheckboxToggle(member.name, dateStr, e.target.checked)} className="accent-[#E67E22] h-4 w-4 rounded border-[#27272A] bg-[#18181C] cursor-pointer" />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* [비활성 안내 문구 — 임시 비활성화. 되살리려면 주석 해제]
            <div className="mt-3 flex items-center gap-1.5 text-xs text-white">
              <span>💤</span>
              <span>최근 5일 이상 체크 안 하신 분은 흐리게 표시되고 명단 하단으로 이동해요</span>
            </div>
            */}
          </div>
        )}

        {/* 통독 범위 툴팁 — position:fixed(뷰포트 기준)라 sticky 헤더의 overflow에 안 잘림 */}
        {readingTip && (
          <div
            style={{ position: 'fixed', left: readingTip.x, top: readingTip.y + 6, transform: 'translateX(-50%)', zIndex: 60 }}
            className="bg-[#1F1F23] border border-[#E67E22]/50 text-[#F3F4F6] text-[13px] font-bold px-3 py-2 rounded-lg shadow-2xl whitespace-nowrap pointer-events-none"
          >
            <span className="text-[#E67E22]">📖</span> {readingTip.text}
          </div>
        )}
      </div>
    </div>
  );
}
