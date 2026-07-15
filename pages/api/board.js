import { neon } from '@neondatabase/serverless';

// tongdok.js와 동일한 환경변수명을 쓰세요. (보통 DATABASE_URL)
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  try {
    // ── 조회: 게시판 전체(제출한 조만). PIN은 절대 반환하지 않음 ──
    // meeting_date는 to_char로 문자열 고정 → Date/타임존 변환 버그 방지
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT group_id,
               author_name,
               meeting_info,
               to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date,
               updated_at
        FROM meeting_board
      `;
      return res.status(200).json({ entries: rows });
    }

    // ── 저장/삭제: 내 조 한 줄만 업서트 ──
    if (req.method === 'POST') {
      const { groupId, authorName, meetingInfo, meetingDate, pin } = req.body || {};

      if (!groupId || typeof groupId !== 'string') {
        return res.status(400).json({ error: 'groupId 필요' });
      }

      // PIN 검증: 해당 조에 roster_pin이 등록돼 있으면 반드시 일치해야 함.
      // group_id는 문자열 그대로 비교 (§3.3 — Number() 금지)
      const pinRows = await sql`
        SELECT roster_pin FROM group_settings WHERE group_id = ${groupId}
      `;
      if (pinRows.length > 0) {
        if (!pin || String(pin) !== String(pinRows[0].roster_pin)) {
          return res.status(403).json({ error: 'PIN 불일치' });
        }
      }

      const name = (authorName || '').trim();
      const info = (meetingInfo || '').trim();

      // 날짜: 'YYYY-MM-DD' 형식만 허용, 아니면 null
      let mdate = (meetingDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(mdate)) mdate = null;

      // 성함·모임내용 둘 다 비어 있으면 내 조 항목 삭제
      if (name === '' && info === '') {
        await sql`DELETE FROM meeting_board WHERE group_id = ${groupId}`;
        return res.status(200).json({ ok: true, deleted: true });
      }

      await sql`
        INSERT INTO meeting_board (group_id, author_name, meeting_info, meeting_date, updated_at)
        VALUES (${groupId}, ${name}, ${info}, ${mdate}, now())
        ON CONFLICT (group_id)
        DO UPDATE SET author_name  = EXCLUDED.author_name,
                      meeting_info = EXCLUDED.meeting_info,
                      meeting_date = EXCLUDED.meeting_date,
                      updated_at   = now()
      `;
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('board api error', e);
    return res.status(500).json({ error: 'server error' });
  }
}
