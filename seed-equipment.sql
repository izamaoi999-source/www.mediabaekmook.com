-- 방배점 기본 장비 (사이트에 안내된 항목 기준). 이미 데이터가 있으면 아무것도 넣지 않음.
-- 모델명·수량은 관리자 화면(/equipment.html?admin#bangbae)에서 채워 주세요.
INSERT INTO equipment (studio, category, name, model, qty, note, sort_order, created_at, updated_at)
SELECT column1, column2, column3, column4, column5, column6, column7, 0, 0 FROM (VALUES
  ('bangbae', '촬영', '카메라', '', NULL, '', 10),
  ('bangbae', '촬영', '모니터', '', NULL, '촬영 화면 확인용', 20),
  ('bangbae', '음향', '마이크', '', NULL, '', 30),
  ('bangbae', '판서', '전자칠판 (대형 디스플레이)', '', NULL, '', 40),
  ('bangbae', '판서', '칠판', '', NULL, '', 50),
  ('bangbae', '배경·조명', '크로마키 배경', '', NULL, '', 60),
  ('bangbae', '배경·조명', 'LED 조명', '', NULL, '', 70)
) WHERE NOT EXISTS (SELECT 1 FROM equipment WHERE studio = 'bangbae');
UPDATE equipment SET created_at = CAST(strftime('%s','now') AS INTEGER) * 1000, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE created_at = 0;
