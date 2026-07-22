// Supabase 프로젝트 연결 설정
// publishable key는 클라이언트에 노출되어도 되는 공개 키입니다.
// 단, Supabase 대시보드에서 각 테이블에 RLS(Row Level Security) 정책이
// 올바르게 설정되어 있어야 데이터가 안전하게 보호됩니다. (설명은 supabase/schema.sql 참고)
var SUPABASE_URL = "https://lhfziuqnzfxahpojcfln.supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3vKfwXgB8wwIHfYU50vSrw_P0RVM2fj";

var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// 특정 계산기가 사용되었다는 사실만 익명으로 기록합니다.
// 출생연도, 소득, 가입기간 등 사용자가 입력한 구체적인 값은 절대 전송하지 않습니다.
function logCalculatorUsage(pensionType) {
  try {
    supabaseClient.from("calc_usage").insert({ pension_type: pensionType }).then(function () {});
  } catch (e) {
    // 통계 수집 실패는 사용자 경험에 영향을 주지 않도록 조용히 무시합니다.
  }
}
