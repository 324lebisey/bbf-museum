import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const TOTAL_DAYS_BY_MONTH = {
  '7월': 27, '8월': 26, '9월': 26, '10월': 27, '11월': 23
};
const TOTAL_150_DAYS = 131; 

const ARTWORKS = {
  '150일': 'https://upload.wikimedia.org/wikipedia/commons/1/17/JEAN-FRAN%C3%87OIS_MILLET_-_El_%C3%81ngelus_%28Museo_de_Orsay%2C_1857-1859._%C3%93leo_sobre_lienzo%2C_55.5_x_66_cm%29.jpg',
  '7월': 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Michelangelo_-_Creation_of_Adam_%28cropped%29.jpg',
  '8월': '/august.jpg',     
  '9월': '/september.jpg',  
  '10월': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Transfiguration_Raphael.jpg/960px-Transfiguration_Raphael.jpg',
  '11월': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg/3840px-The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg'
};

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

  useEffect(() => {
    if (!month) return;
    fetch(`/api/tongdok?allGroups=true&month=${month}&_cb=${Date.now()}`)
      .then((r) => r.json())
      .then((data) => setMosaicGroups(data.groups || []))
      .catch(() => setMosaicGroups([]));
  }, [month]);

  if (mosaicGroups.length === 0) return null;

  // 우리 조 타일의 위치(행/열)를 먼저 찾아서, 오버레이 좌표 계산에 씀
  let idx = 0;
  let selfPos = null; // { rowIdx, colIdx, colCount }
  const rows = MOSAIC_ROW_COUNTS.map((colCount, rowIdx) => {
    const items = Array.from({ length: colCount }).map((_, colIdx) => {
      const g = mosaicGroups[idx];
      const currentIdx = idx;
      idx += 1;
      if (g && String(g.groupId) === String(currentGroupId)) {
        selfPos = { rowIdx, colIdx, colCount };
      }
      return { g, currentIdx, colIdx };
    });
    return { colCount, items };
  });

  return (
    <div className="mt-8">
      <div className="text-[11px] text-[#52525B] font-mono tracking-widest uppercase mb-3 text-center">
        94개조 진행 현황
      </div>
      <div
        className="relative w-full rounded-xl overflow-hidden border border-[#27272A] flex flex-col"
        style={{ aspectRatio: '16/9', background: '#000' }}
        onMouseLeave={() => setHoverGroup(null)}
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
                  onClick={() => { window.location.href = `/?id=${g.groupId}`; }}
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

        {/* 우리 조 하이라이트: 별도 최상단 레이어라 절대 안 가려짐 */}
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
        {hoverGroup && (
          <span>
            <span style={{ fontSize: '17px' }} className="font-bold text-[#D4D4D8]">{hoverGroup.groupId}조</span>
            <span style={{ fontSize: '17px' }} className="text-[#52525B]"> · </span>
            <span style={{ fontSize: '22px' }} className="font-black text-[#E67E22]">{hoverGroup.percent}%</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function GroupDashboard() {
  const router = useRouter();
  const { id: queryId } = router.query;

  const [activeTab, setActiveTab] = useState('우리 조 작품');
  const [currentMonth, setCurrentMonth] = useState('7월');
  const [selectedGroupToggle, setSelectedGroupToggle] = useState('');
  
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allGroupsLogsCount, setAllGroupsLogsCount] = useState(0);
  const [totalPeople, setTotalPeople] = useState(0); // 현재 등록 인원(분모). 이탈하면 자동으로 줄어듦

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
    
    const nameList = memberInput.split(',').map(n => n.trim()).filter(n => n !== '');
    
    const response = await fetch(`/api/tongdok?groupId=${groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', names: nameList })
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

  // ── 비활성 판정: 달력 날짜가 아니라 '일차(주일 제외)' 기준 ──
  const todayGlobal = getTodayGlobalIndex();               // 예: 7/7(화) → 6일차
  const isTodayReadingDay = new Date().getDay() !== 0;     // 주일이면 오늘은 셀 날이 아님

  const processedMembers = members.map(m => {
    const memberLogs = logs.filter(l => l.member_name === m.name);
    let isInactive = false;
    if (memberLogs.length > 0) {
      const latestGlobal = Math.max(...memberLogs.map(l => toGlobalIndex(l.check_date)));
      // 안 읽은 일차 = 마지막 체크 다음 일차 ~ (오늘이 통독일이면 어제 일차까지)
      const missed = Math.max(todayGlobal - latestGlobal - (isTodayReadingDay ? 1 : 0), 0);
      if (missed >= 5) isInactive = true;
    } else {
      isInactive = true;
    }
    return { ...m, isInactive };
  }).sort((a, b) => a.isInactive - b.isInactive);

  const activeMemberCount = processedMembers.filter(m => !m.isInactive).length;
  const targetDays = TOTAL_DAYS_BY_MONTH[currentMonth] || 30;
  const groupTargetGoal = activeMemberCount * targetDays;
  
const monthString = currentMonth.replace('월', '').padStart(2, '0');
  const activeNames = new Set(processedMembers.filter(m => !m.isInactive).map(m => m.name));
  const groupCurrentChecked = logs.filter(
    l => activeNames.has(l.member_name) && l.check_date.includes('-' + monthString + '-')
  ).length;
  // 주간 구분선용: [i] = (i+1)일차의 실제 달력 날짜
  const readingDates = getReadingDates(currentMonth);

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
          // 맞닿은 손끝 사이(35% 47%)에서 아주 작게 시작 → 진행률만큼 선형으로 커짐
          const jCore = Number(percent);   // 완전 밝은 반경 (진행률 1:1)
          const jEdge = jCore + 5;          // 페이드 폭 (작을수록 시작 원이 더 조여짐)
          maskValue = 'radial-gradient(circle at 35% 47%, rgba(0,0,0,1) ' + jCore + '%, rgba(0,0,0,0) ' + jEdge + '%)';
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
          <div className={'text-[11px] text-[#52525B] font-mono tracking-widest uppercase transition-all ' + (isOctober ? 'mt-10' : 'mt-6')}>
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

            <div className="overflow-x-auto rounded-xl border border-[#1F1F23] bg-[#0E0E11]">
              <table className="w-full text-sm text-center">
                <thead>
                  <tr className="bg-[#141416] text-[#52525B] border-b border-[#1F1F23] text-xs font-bold">
                    <th className="py-3 px-4 text-left sticky left-0 bg-[#141416] text-[#A1A1AA] z-10 border-r border-[#1F1F23]">이름</th>
                    {Array.from({ length: targetDays }).map((_, i) => {
                      // 주간 구분선: 토요일(한 주의 마지막 통독일) 오른쪽에 얇은 선
                      const isWeekEnd = readingDates[i] && readingDates[i].getDay() === 6;
                      // 저장은 여전히 일차(1,2,3…) 기준이지만, 화면엔 실제 날짜 숫자만 표시 (일요일 제외)
                      const displayDate = readingDates[i] ? readingDates[i].getDate() : i + 1;
                      return (
                        <th key={i} className={'py-3 px-2 min-w-[48px] font-mono text-[#71717A]' + (isWeekEnd ? ' border-r border-[#33333A]' : '')}>
                          {displayDate}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F23]">
                  {processedMembers.map((member) => (
                    <tr key={member.id} className={'hover:bg-[#18181C]/50 transition-all ' + (member.isInactive ? 'opacity-30 bg-black/40' : '')}>
                      <td className="py-3 px-4 font-bold text-left text-sm text-[#D4D4D8] sticky left-0 bg-[#121215] border-r border-[#1F1F23] z-10">{member.name}</td>
                      {Array.from({ length: targetDays }).map((_, i) => {
                        const dateStr = '2026-' + monthString + '-' + String(i+1).padStart(2, '0');
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
        )}

      </div>
    </div>
  );
}
