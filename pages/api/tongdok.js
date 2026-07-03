import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Neon 환경변수 체크
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL 환경 변수가 세팅되지 않았습니다.' });
  }

  const sql = neon(process.env.DATABASE_URL);
  const { groupId, global } = req.query;

  try {
    // 1. 전체 조의 누적 체크 수 조회 (이달의 명화 / 150일 대장정용)
if (global === 'true') {
  const result = await sql`SELECT current_count FROM global_counter WHERE counter_name = 'global_tongdok_count'`;
  // 🛠️ 패치: 전체 카운트를 그대로 다 보여주지 않고, 3으로 나눈 값만 노출하여 
  // 체감 속도를 3배 느리게 체감되도록 조정했습니다.
  const count = Math.floor((result[0]?.current_count || 0) / 3);
  return res.status(200).json({ globalCount: Number(count) });
}

    if (!groupId) {
      return res.status(400).json({ error: 'GroupId가 필요합니다.' });
    }

    // 2. 데이터 불러오기 (GET)
    // pages/api/tongdok.js 의 GET 부분 (전체 교체)
// pages/api/tongdok.js 의 GET 부분 (전체 교체)
if (req.method === 'GET') {
  // 🛠️ 명단은 id(등록순)로, 로그는 날짜순으로 강제 정렬하여 보내줍니다.
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
      if (action === 'check') {
        const { name, date } = req.body;

        // 중복 체크를 방지하며 INSERT 실행
        const insertResult = await sql`
          INSERT INTO tongdok_logs (group_id, member_name, check_date)
          VALUES (${groupId}, ${name}, ${date})
          ON CONFLICT (group_id, member_name, check_date) DO NOTHING
        `;

        // 가짜 혹은 중복 호출이 아닐 때만 글로벌 카운트 +1 처리
        await sql`
          UPDATE global_counter 
          SET current_count = current_count + 1 
          WHERE counter_name = 'global_tongdok_count'
        `;

        const logs = await sql`SELECT member_name, check_date FROM tongdok_logs WHERE group_id = ${groupId}`;
        return res.status(200).json({ success: true, logs });
      }

      // [Action C] 체크박스 OFF (취소)
      if (action === 'uncheck') {
        const { name, date } = req.body;

        // 삭제 전 데이터가 실제 존재하는지 확인 후 차감 처리
        const checkExist = await sql`
          SELECT id FROM tongdok_logs 
          WHERE group_id = ${groupId} AND member_name = ${name} AND check_date = ${date}
        `;

        if (checkExist.length > 0) {
          await sql`
            DELETE FROM tongdok_logs 
            WHERE group_id = ${groupId} AND member_name = ${name} AND check_date = ${date}
          `;
          
          await sql`
            UPDATE global_counter 
            SET current_count = current_count - 1 
            WHERE counter_name = 'global_tongdok_count'
          `;
        }

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
