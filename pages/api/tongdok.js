import { neon } from '@neondatabase/serverless';

// Vercel 환경변수에 등록될 DATABASE_URL을 사용해 Neon SQL 인스턴스를 초기화합니다.
const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  // 1. [최초 접속 예외 처리] DB 테이블이 아직 없을 경우 자동으로 최초 1회 생성해 줍니다.
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        group_id INT NOT NULL,
        name VARCHAR(50) NOT NULL
      );
    `);
    await sql(`
      CREATE TABLE IF NOT EXISTS tongdok_logs (
        id SERIAL PRIMARY KEY,
        group_id INT NOT NULL,
        member_name VARCHAR(50) NOT NULL,
        check_date VARCHAR(20) NOT NULL,
        UNIQUE(group_id, member_name, check_date)
      );
    `);
  } catch (e) {
    console.error("초기 테이블 생성 중 예외 발생 (무시 가능): ", e);
  }

  const { method, query, body } = req;

  // ----------------------------------------------------
  // GET 요청: 화면에 띄울 데이터 조회하기
  // ----------------------------------------------------
  if (method === 'GET') {
    const { groupId, global } = query;

    // 대장정/연합 탭용: 전 조원들이 마킹한 모든 체크박스 개수 총합 연산
    if (global === 'true') {
      const result = await sql('SELECT COUNT(*)::int as count FROM tongdok_logs');
      return res.status(200).json({ globalCount: result[0].count });
    }

    // 우리조 탭용: 현재 조에 속한 조원 명단 및 체크 로그 동시 조회
    const membersRows = await sql('SELECT * FROM members WHERE group_id = $1', [groupId]);
    const logsRows = await sql('SELECT * FROM tongdok_logs WHERE group_id = $1', [groupId]);
    
    return res.status(200).json({ 
      members: membersRows, 
      logs: logsRows 
    });
  }

  // ----------------------------------------------------
  // POST 요청: 체크박스 조작 및 명단 저장하기
  // ----------------------------------------------------
  if (method === 'POST') {
    const { action, groupId, names, name, date } = body;

    // 액션 1: 조원 명단 신규 저장 및 덮어쓰기
    if (action === 'register') {
      // 기존 해당 조 명단만 초기화 후 깔끔하게 재생성 (체크 로그는 이름이 같으면 유지됨)
      await sql('DELETE FROM members WHERE group_id = $1', [groupId]);
      for (const n of names) {
        await sql('INSERT INTO members (group_id, name) VALUES ($1, $2)', [groupId, n]);
      }
      return res.status(200).json({ success: true });
    }

    // 액션 2: 성경 읽음 체크인 처리
    if (action === 'check') {
      try {
        await sql(
          'INSERT INTO tongdok_logs (group_id, member_name, check_date) VALUES ($1, $2, $3)', 
          [groupId, name, date]
        );
      } catch (e) {
        // 무결성 제약조건(중복 클릭)으로 인한 에러는 안전하게 패스합니다.
      }
      return res.status(200).json({ success: true });
    }

    // 액션 3: 체크 해제 처리 (실수 취소용)
    if (action === 'uncheck') {
      await sql(
        'DELETE FROM tongdok_logs WHERE group_id = $1 AND member_name = $2 AND check_date = $3', 
        [groupId, name, date]
      );
      return res.status(200).json({ success: true });
    }
  }

  // 지정되지 않은 메서드 접근 거부
  return res.status(405).json({ message: 'Method Not Allowed' });
}