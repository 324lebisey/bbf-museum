import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

// 94개 조 ID 생성 (17,22,26은 A/B 분할) — 기존 규칙 그대로
const SPLIT_GROUPS = new Set([17, 22, 26]);
const ALL_GROUP_IDS = (() => {
  const ids = [];
  for (let i = 1; i <= 91; i++) {
    if (SPLIT_GROUPS.has(i)) ids.push(`${i}A`, `${i}B`);
    else ids.push(String(i));
  }
  return ids;
})();
const ORDER = new Map(ALL_GROUP_IDS.map((id, i) => [id, i]));

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function buildMonthGrid(year, month) { // month 1-12
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function Board() {
  const router = useRouter();
  const now = new Date();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // 달력 상태
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD' | null

  // 편집 폼 상태
  const [selectedGroup, setSelectedGroup] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [meetingInfo, setMeetingInfo] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [noMeeting, setNoMeeting] = useState(false);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/board');
      const data = await r.json();
      setEntries(data.entries || []);
    } catch (e) {
      // 조용히 실패 — 기존 목록 유지
    } finally {
      setLoading(false);
    }
  }, []);

  // 최초 로드 + window focus에서만 갱신 (폴링 없음 — Neon 무료 플랜 보호)
  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // URL ?id= 로 내 조 미리 선택 (예: /board?id=22A)
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query.id;
    if (typeof q === 'string' && ALL_GROUP_IDS.includes(q)) {
      setSelectedGroup(q);
    }
  }, [router.isReady, router.query.id]);

  // 조 선택 시, 이미 제출한 내용이 있으면 폼에 채워 넣기(수정 편의)
  useEffect(() => {
    if (!selectedGroup) return;
    const existing = entries.find((e) => e.group_id === selectedGroup);
    if (existing) {
      setAuthorName(existing.author_name || '');
      setMeetingDate(existing.meeting_date || '');
      if ((existing.meeting_info || '').trim() === '모임X') {
        setNoMeeting(true);
        setMeetingInfo('');
      } else {
        setNoMeeting(false);
        setMeetingInfo(existing.meeting_info || '');
      }
    }
  }, [selectedGroup, entries]);

  // 날짜별 모임 집계
  const byDate = useMemo(() => {
    const map = {};
    entries.forEach((e) => {
      if (e.meeting_date) {
        (map[e.meeting_date] = map[e.meeting_date] || []).push(e);
      }
    });
    return map;
  }, [entries]);

  // 아래 목록: 선택 날짜가 있으면 그날만, 없으면 전체(날짜순 → 미정 순)
  const listEntries = useMemo(() => {
    if (selectedDate) {
      return (byDate[selectedDate] || []).slice().sort(
        (a, b) => (ORDER.get(a.group_id) ?? 999) - (ORDER.get(b.group_id) ?? 999)
      );
    }
    return entries.slice().sort((a, b) => {
      const ad = a.meeting_date || '';
      const bd = b.meeting_date || '';
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return (ORDER.get(a.group_id) ?? 999) - (ORDER.get(b.group_id) ?? 999);
    });
  }, [entries, byDate, selectedDate]);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const gotoMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setViewYear(y);
    setViewMonth(m);
    setSelectedDate(null);
  };

  const handleSave = async () => {
    if (!selectedGroup) { setMessage('조를 선택해주세요.'); return; }
    if (!authorName.trim()) { setMessage('성함을 입력해주세요.'); return; }
    setSaving(true);
    setMessage('');
    const info = noMeeting ? '모임X' : meetingInfo.trim();
    try {
      const r = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: selectedGroup,
          authorName: authorName.trim(),
          meetingInfo: info,
          meetingDate: noMeeting ? '' : meetingDate,
          pin: pin.trim(),
        }),
      });
      if (r.status === 403) { setMessage('PIN이 일치하지 않습니다. (명단 저장 때 쓰신 PIN)'); return; }
      if (!r.ok) { setMessage('저장 중 오류가 발생했습니다.'); return; }
      setPin('');
      setMessage('저장되었습니다.');
      await load();
    } catch (e) {
      setMessage('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedGroup) return;
    if (typeof window !== 'undefined' && !window.confirm(`${selectedGroup}조 항목을 삭제할까요?`)) return;
    setSaving(true);
    setMessage('');
    try {
      const r = await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroup, authorName: '', meetingInfo: '', meetingDate: '', pin: pin.trim() }),
      });
      if (r.status === 403) { setMessage('PIN이 일치하지 않습니다. (명단 저장 때 쓰신 PIN)'); return; }
      if (!r.ok) { setMessage('삭제 중 오류가 발생했습니다.'); return; }
      setAuthorName(''); setMeetingInfo(''); setMeetingDate(''); setNoMeeting(false); setPin('');
      setMessage('삭제되었습니다.');
      await load();
    } catch (e) {
      setMessage('삭제 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const hasMyEntry = selectedGroup && entries.some((e) => e.group_id === selectedGroup);

  return (
    <>
      <Head>
        <title>모임 현황판 — BBF 3기 성경통독 박물관</title>
      </Head>
      <div className="min-h-screen bg-[#18181C] text-gray-100 px-4 py-8">
        <div className="max-w-2xl mx-auto">

          <header className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-[#E67E22]">모임 현황판</h1>
            <p className="mt-1 text-sm text-gray-400">BBF 3기 · 줌/오프라인 모임 일시 공유</p>
          </header>

          {/* ── 달력 ── */}
          <div className="mb-6 rounded-xl border border-[#33333A] bg-[#1E1E24] p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => gotoMonth(-1)}
                className="rounded-md px-3 py-1 text-sm text-gray-300 hover:bg-[#27272A]"
              >‹</button>
              <div className="text-base font-semibold text-white">{viewYear}년 {viewMonth}월</div>
              <button
                onClick={() => gotoMonth(1)}
                className="rounded-md px-3 py-1 text-sm text-gray-300 hover:bg-[#27272A]"
              >›</button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={'text-center text-xs py-1 ' + (i === 0 ? 'text-red-400' : 'text-gray-500')}
                >{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {grid.map((day, idx) => {
                if (day === null) return <div key={idx} />;
                const key = dateKey(viewYear, viewMonth, day);
                const count = (byDate[key] || []).length;
                const isSel = selectedDate === key;
                const isSun = idx % 7 === 0;
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedDate(isSel ? null : (count > 0 ? key : null))}
                    disabled={count === 0}
                    className={
                      'relative aspect-square rounded-lg text-sm flex flex-col items-center justify-center transition ' +
                      (isSel
                        ? 'bg-[#E67E22] text-white font-bold'
                        : count > 0
                          ? 'bg-[#E67E22]/15 text-[#E67E22] font-semibold hover:bg-[#E67E22]/25 cursor-pointer'
                          : (isSun ? 'text-red-400/60' : 'text-gray-400') + ' cursor-default')
                    }
                  >
                    <span>{day}</span>
                    {count > 0 && (
                      <span className={'mt-0.5 text-[10px] leading-none ' + (isSel ? 'text-white' : 'text-[#E67E22]')}>
                        {count}건
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 목록 ── */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400">
                {selectedDate
                  ? `${Number(selectedDate.slice(5, 7))}월 ${Number(selectedDate.slice(8, 10))}일 모임 (${listEntries.length})`
                  : `전체 (${entries.length})`}
              </h2>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-xs text-gray-400 hover:text-white"
                >전체 보기</button>
              )}
            </div>

            {loading ? (
              <p className="text-sm text-gray-500">불러오는 중…</p>
            ) : listEntries.length === 0 ? (
              <p className="text-sm text-gray-500">표시할 모임이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {listEntries.map((e) => {
                  const info = (e.meeting_info || '').trim();
                  const isNo = info === '모임X';
                  const isDone = info === '모임완료';
                  return (
                    <li
                      key={e.group_id}
                      className="flex items-start gap-3 rounded-lg border border-[#27272A] bg-[#1E1E24] px-4 py-3"
                    >
                      <span className="shrink-0 rounded-md bg-[#E67E22]/15 px-2 py-1 text-xs font-bold text-[#E67E22]">
                        {e.group_id}조
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{e.author_name}</span>
                          {isDone && (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                              완료
                            </span>
                          )}
                        </div>
                        <div className={'text-sm ' + (isNo || isDone ? 'text-gray-500' : 'text-gray-300')}>
                          {info || '—'}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* ── 내 조 등록/수정 ── */}
          <div className="rounded-xl border border-[#33333A] bg-[#1E1E24] p-4">
            <h2 className="text-sm font-semibold text-gray-300 mb-3">내 조 등록 / 수정</h2>
            <div className="grid gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">조 선택</label>
                <select
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  className="w-full rounded-lg bg-[#18181C] border border-[#33333A] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E67E22]"
                >
                  <option value="">— 조를 선택하세요 —</option>
                  {ALL_GROUP_IDS.map((id) => (
                    <option key={id} value={id}>{id}조</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">성함</label>
                <input
                  type="text"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="예) 나하람"
                  className="w-full rounded-lg bg-[#18181C] border border-[#33333A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E67E22]"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-300 mb-2">
                  <input
                    type="checkbox"
                    checked={noMeeting}
                    onChange={(e) => setNoMeeting(e.target.checked)}
                    className="accent-[#E67E22] h-4 w-4"
                  />
                  모임 없음 (모임X)
                </label>

                {!noMeeting && (
                  <div className="grid gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">모임 날짜 (달력 표시용)</label>
                      <input
                        type="date"
                        value={meetingDate}
                        onChange={(e) => setMeetingDate(e.target.value)}
                        className="w-full rounded-lg bg-[#18181C] border border-[#33333A] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E67E22]"
                      />
                      <p className="mt-1 text-[11px] text-gray-500">날짜가 아직 미정이면 비워두세요. (달력엔 안 뜨고 목록에만 표시)</p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">모임 안내 (시간/장소 등)</label>
                      <input
                        type="text"
                        value={meetingInfo}
                        onChange={(e) => setMeetingInfo(e.target.value)}
                        placeholder="예) 7월 23일 (목) 밤 9시 30분 줌모임"
                        className="w-full rounded-lg bg-[#18181C] border border-[#33333A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E67E22]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">PIN (명단 저장 때 쓰신 비밀번호)</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN 미등록 조는 비워두셔도 됩니다"
                  className="w-full rounded-lg bg-[#18181C] border border-[#33333A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E67E22]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-[#E67E22] px-4 py-2 text-sm font-semibold text-white hover:bg-[#D06E1A] disabled:opacity-50"
                >
                  {saving ? '처리 중…' : '저장하기'}
                </button>
                {hasMyEntry && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="rounded-lg border border-[#33333A] px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-50"
                  >
                    삭제
                  </button>
                )}
              </div>

              {message && <p className="text-sm text-center text-[#E67E22]">{message}</p>}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
