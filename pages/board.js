import { useState, useEffect, useCallback } from 'react';
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
// 정렬 기준(조 번호 순). 문자열 정렬이 아니라 이 인덱스로 정렬해야 1,2,...,17A,17B 순서가 맞음
const ORDER = new Map(ALL_GROUP_IDS.map((id, i) => [id, i]));

export default function Board() {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [meetingInfo, setMeetingInfo] = useState('');
  const [noMeeting, setNoMeeting] = useState(false);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/board');
      const data = await r.json();
      const sorted = (data.entries || [])
        .slice()
        .sort((a, b) => (ORDER.get(a.group_id) ?? 999) - (ORDER.get(b.group_id) ?? 999));
      setEntries(sorted);
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
      if ((existing.meeting_info || '').trim() === '모임X') {
        setNoMeeting(true);
        setMeetingInfo('');
      } else {
        setNoMeeting(false);
        setMeetingInfo(existing.meeting_info || '');
      }
    }
  }, [selectedGroup, entries]);

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
          pin: pin.trim(),
        }),
      });
      if (r.status === 403) {
        setMessage('PIN이 일치하지 않습니다. (명단 저장 때 쓰신 PIN)');
        return;
      }
      if (!r.ok) {
        setMessage('저장 중 오류가 발생했습니다.');
        return;
      }
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
        body: JSON.stringify({
          groupId: selectedGroup,
          authorName: '',
          meetingInfo: '',
          pin: pin.trim(),
        }),
      });
      if (r.status === 403) {
        setMessage('PIN이 일치하지 않습니다. (명단 저장 때 쓰신 PIN)');
        return;
      }
      if (!r.ok) {
        setMessage('삭제 중 오류가 발생했습니다.');
        return;
      }
      setAuthorName('');
      setMeetingInfo('');
      setNoMeeting(false);
      setPin('');
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

          {/* 안내 */}
          <div className="mb-6 rounded-xl border border-[#27272A] bg-[#1E1E24] p-4 text-sm text-gray-300 leading-relaxed">
            본인 조를 선택해 <b className="text-white">성함</b>과 <b className="text-white">모임 일시</b>를 남겨주세요.
            모임을 안 가지시면 <b className="text-white">‘모임 없음’</b>에 체크하시면 됩니다.
            <br />
            <span className="text-gray-400">예) 7월 23일 (목) 밤 9시 30분 줌모임</span>
          </div>

          {/* 편집 카드 */}
          <div className="mb-8 rounded-xl border border-[#33333A] bg-[#1E1E24] p-4">
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
                  <input
                    type="text"
                    value={meetingInfo}
                    onChange={(e) => setMeetingInfo(e.target.value)}
                    placeholder="예) 7월 23일 (목) 밤 9시 30분 줌모임"
                    className="w-full rounded-lg bg-[#18181C] border border-[#33333A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#E67E22]"
                  />
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

              {message && (
                <p className="text-sm text-center text-[#E67E22]">{message}</p>
              )}
            </div>
          </div>

          {/* 목록 */}
          <h2 className="mb-3 text-sm font-semibold text-gray-400">
            제출한 조 ({entries.length})
          </h2>

          {loading ? (
            <p className="text-sm text-gray-500">불러오는 중…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-500">아직 제출한 조가 없습니다.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => {
                const isNo = (e.meeting_info || '').trim() === '모임X';
                return (
                  <li
                    key={e.group_id}
                    className="flex items-start gap-3 rounded-lg border border-[#27272A] bg-[#1E1E24] px-4 py-3"
                  >
                    <span className="shrink-0 rounded-md bg-[#E67E22]/15 px-2 py-1 text-xs font-bold text-[#E67E22]">
                      {e.group_id}조
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{e.author_name}</div>
                      <div className={'text-sm ' + (isNo ? 'text-gray-500' : 'text-gray-300')}>
                        {e.meeting_info || '—'}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

        </div>
      </div>
    </>
  );
}
