import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const TOTAL_DAYS_BY_MONTH = {
  '7월': 27, '8월': 26, '9월': 26, '10월': 27, '11월': 25
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

export default function GroupDashboard() {
  const router = useRouter();
  const { id: queryId } = router.query;

  const [activeTab, setActiveTab] = useState('우리조 명화');
  const [currentMonth, setCurrentMonth] = useState('7월');
  const [selectedGroupToggle, setSelectedGroupToggle] = useState('');
  
  const [memberInput, setMemberInput] = useState('');
  const [members, setMembers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allGroupsLogsCount, setAllGroupsLogsCount] = useState(0);

  // 🛠️ [패치] 주소창의 조 번호를 명확하게 인지할 때까지 감시하고 정해지면 데이터를 불러옵니다.
  const groupId = queryId; 

  useEffect(() => {
    if (groupId) {
      setSelectedGroupToggle(groupId);
      fetchData(groupId);
      fetchGlobalProgress();
    }
  }, [groupId]);

const fetchData = async (targetGroupId) => {
    if (!targetGroupId) return;
    const res = await fetch(`/api/tongdok?groupId=${targetGroupId}&_cb=${Date.now()}`);
    if (res.ok) {
      const result = await res.json();
      // 🛠️ 패치: 명단 순서를 고정하고, 상태를 업데이트합니다.
      setMembers([...result.members]); 
      setLogs(result.logs || []);
    }
  };

  const fetchGlobalProgress = async () => {
    const res = await fetch('/api/tongdok?global=true');
    const result = await res.json();
    setAllGroupsLogsCount(result.globalCount || 0);
  };

  const handleRegisterMembers = async () => {
    // 🛠️ [패치] 조 번호(groupId)가 비어있거나 인식이 안 되었으면 즉시 중단합니다.
    if (!groupId) {
      alert("조 번호(ID)를 주소창에서 아직 읽어오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    
    if (!memberInput.trim()) return;
    if (!confirm(`${groupId}조 명단을 변경하시겠습니까? 기존 기록은 이름이 일치하면 유지됩니다.`)) return;
    
    const nameList = memberInput.split(',').map(n => n.trim()).filter(n => n !== '');
    
    // 🛠️ [패치] 주소창 파라미터로도 확실하게 groupId를 꽂아서 보냅니다.
    const response = await fetch(`/api/tongdok?groupId=${groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', names: nameList })
    });

    if (response.ok) {
      alert('명단이 성공적으로 저장되었습니다!');
      await fetchData(groupId);
      await fetchGlobalProgress();
    } else {
      // 🛠️ [패치] 실패 시 백엔드가 준 구체적인 에러 메시지를 띄우도록 보완합니다.
      const errData = await response.json();
      alert(`명단 저장 실패: ${errData.error || '알 수 없는 오류'}`);
    }
  };

const handleCheckboxToggle = async (memberName, dateStr, isChecked) => {
    if (!groupId) {
      alert("조 번호를 아직 읽어오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    try {
      // 🛠️ 주소 뒤에 ?groupId=... 를 붙여서 백엔드가 인식할 수 있게 합니다.
      await fetch(`/api/tongdok?groupId=${groupId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: isChecked ? 'check' : 'uncheck', 
          name: memberName, 
          date: dateStr 
        })
      });
      
      // 데이터 새로고침도 순서대로 확실하게 처리되도록 await를 붙여줍니다.
      await fetchData(groupId);
      await fetchGlobalProgress();
    } catch (err) {
      console.error("체크박스 업데이트 실패:", err);
    }
  };

  const handleGroupToggleChange = (e) => {
    const target = e.target.value;
    setSelectedGroupToggle(target);
    fetchData(target);
  };

  const processedMembers = members.map(m => {
    const memberLogs = logs.filter(l => l.member_name === m.name);
    let isInactive = false;
    if (memberLogs.length > 0) {
      const latestDate = new Date(Math.max(...memberLogs.map(l => new Date(l.check_date))));
      const diffDays = Math.ceil(Math.abs(new Date() - latestDate) / (1000 * 60 * 60 * 24));
      if (diffDays > 5) isInactive = true;
    } else {
      isInactive = true;
    }
    return { ...m, isInactive };
  }).sort((a, b) => a.isInactive - b.isInactive);

  const activeMemberCount = processedMembers.filter(m => !m.isInactive).length;
  const targetDays = TOTAL_DAYS_BY_MONTH[currentMonth] || 30;
  const groupTargetGoal = activeMemberCount * targetDays;
  
  const monthString = currentMonth.replace('월', '').padStart(2, '0');
  const groupCurrentChecked = logs.filter(l => l.check_date.includes('-' + monthString + '-')).length;

  let progressPercent = 0;
  if (activeTab === '우리조 명화') {
    progressPercent = groupTargetGoal > 0 ? ((groupCurrentChecked / groupTargetGoal) * 100) : 0;
  } else if (activeTab === '이달의 명화 전시관') {
    progressPercent = (allGroupsLogsCount / (1500 * targetDays)) * 100;
  } else {
    progressPercent = (allGroupsLogsCount / (1500 * TOTAL_150_DAYS)) * 100;
  }
  progressPercent = Math.min(Number(progressPercent), 100).toFixed(1);

  const getMaskStyle = (percent) => {
    if (Number(percent) === 0) return { WebkitMaskImage: 'none', maskImage: 'none', opacity: 0 };
    let maskValue = '';
    const start = percent * 1.2;
    const end = start + 20;

    if (activeTab === '150일 대장정') {
      maskValue = 'radial-gradient(circle at 50% 68%, rgba(0,0,0,1) ' + start + '%, rgba(0,0,0,0) ' + end + '%)';
    } else {
      switch(currentMonth) {
        case '7월':
          maskValue = 'radial-gradient(circle at 42% 48%, rgba(0,0,0,1) ' + start + '%, rgba(0,0,0,0) ' + end + '%)';
          break;
        case '8월':
          maskValue = 'radial-gradient(circle at 25% 75%, rgba(0,0,0,1) ' + start + '%, rgba(0,0,0,0) ' + end + '%)';
          break;
        case '9월':
          maskValue = 'linear-gradient(315deg, rgba(0,0,0,1) ' + start + '%, rgba(0,0,0,0) ' + end + '%)';
          break;
        case '10월':
          maskValue = 'linear-gradient(0deg, rgba(0,0,0,1) ' + start + '%, rgba(0,0,0,0) ' + end + '%)';
          break;
        case '11월':
          const edgeProgress = percent * 1.2; 
  maskValue = 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ' + edgeProgress + '%, rgba(0,0,0,1) ' + (edgeProgress + 20) + '%)';
  break;
        default:
          maskValue = 'radial-gradient(circle at 50% 50%, rgba(0,0,0,1) ' + start + '%, rgba(0,0,0,0) ' + end + '%)';
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
          {['150일 대장정', '이달의 명화 전시관', '우리조 명화'].map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); fetchData(groupId); }}
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

        {activeTab === '우리조 명화' && (
          <div className="flex justify-end items-center gap-2 mb-4">
            <span className="text-xs text-[#52525B]">타 조 갤러리 순회:</span>
            <select value={selectedGroupToggle} onChange={handleGroupToggleChange} className="bg-[#121215] border border-[#27272A] rounded-lg px-3 py-1.5 text-xs text-[#A1A1AA] focus:outline-none focus:border-[#E67E22]">
              {Array.from({ length: 90 }).map((_, i) => (
                <option key={i+1} value={i+1}>{i+1}조 갤러리</option>
              ))}
            </select>
          </div>
        )}

        {/* 🛠️ [패치] 10월 확대 시 짤림을 막기 위해 컨테이너 패딩 가변 조정(isOctober ? 'py-10' : 'p-5 md:p-8') */}
        <div className={'bg-[#121215] rounded-2xl border border-[#1F1F23] mb-8 text-center shadow-2xl relative transition-all duration-300 ' + (isOctober ? 'p-10 md:p-12' : 'p-5 md:p-8')}>
          
          {/* 🛠️ [패치] 원래 비율은 철저히 사수하되, 10월 선택 시에만 'scale-110' 엔진이 직접 개입하여 그림을 확실하게 10% 증폭시킵니다. */}
          <div className={'relative mx-auto rounded-xl overflow-hidden border border-[#27272A] inline-block transition-all duration-300 ' + (isOctober ? 'max-w-5xl transform scale-110 shadow-2xl' : isLargeMonth ? 'max-w-5xl' : 'max-w-2xl')}>
            
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
          {/* 🛠️ [패치] 그림이 10% 확대되었을 때 수치 마진이 겹치지 않도록 간격 최적화 */}
          <div className={'text-[11px] text-[#52525B] font-mono tracking-widest uppercase transition-all ' + (isOctober ? 'mt-10' : 'mt-6')}>
            {activeTab === '우리조 명화' ? selectedGroupToggle + '조 ' + currentMonth + ' 진도율' : activeTab + ' 진척도'}
          </div>
          <div className="text-5xl font-black text-[#E67E22] mt-1 tracking-tighter">{progressPercent}%</div>
        </div>

        {activeTab === '우리조 명화' && Number(selectedGroupToggle) === Number(groupId) && (
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
                    {Array.from({ length: targetDays }).map((_, i) => (<th key={i} className="py-3 px-2 min-w-[48px] font-mono text-[#71717A]">{i + 1}일</th>))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F1F23]">
                  {processedMembers.map((member) => (
                    <tr key={member.id} className={'hover:bg-[#18181C]/50 transition-all ' + (member.isInactive ? 'opacity-30 bg-black/40' : '')}>
                      <td className="py-3 px-4 font-bold text-left text-sm text-[#D4D4D8] sticky left-0 bg-[#121215] border-r border-[#1F1F23] z-10">{member.name}</td>
                      {Array.from({ length: targetDays }).map((_, i) => {
                        const dateStr = '2026-' + monthString + '-' + String(i+1).padStart(2, '0');
                        const isChecked = logs.some(l => l.member_name === member.name && l.check_date === dateStr);
                        return (
                          <td key={i} className="py-3 px-2">
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
