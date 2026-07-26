/**
 * 연금 계산기 - 공통 계산 로직
 * 아래 계산식은 국민연금법 / 공무원연금법 / 군인연금법 / 사립학교교직원 연금법에
 * 규정된 공식 산정 구조를 단순화하여 근사치를 산출하는 참고용 로직입니다.
 * 실제 급여 결정 기준소득 재평가, 물가상승률 반영, 부양가족연금, 감액/가산 특례 등은
 * 반영되어 있지 않으므로 정확한 수급액은 반드시 해당 연금공단을 통해 확인해야 합니다.
 */

function formatWon(n) {
  var rounded = Math.round(n);
  return rounded.toLocaleString("ko-KR") + "원";
}

function formatManwon(n) {
  return Math.round(n).toLocaleString("ko-KR") + "만원";
}

function clampNonNegative(n) {
  return isFinite(n) && n > 0 ? n : 0;
}

/* -------------------------------------------------------------------------
   국민연금 (National Pension)
   국민연금공단이 공표하는 예상연금월액표(가입기간 × 평균소득월액별 공식 표)의
   실제 수치를 앵커 포인트로 삼아 선형 보간/외삽하는 방식으로 계산합니다.
   각 가입기간(10/20/30/40년) 구간에서 월 수급액은 평균소득월액(B)에 대해
   매우 높은 선형성을 보이므로, 구간별 절편(a)과 기울기(b)를 이용해
   monthly = a(years) + b(years) × B 형태로 근사합니다.
   ------------------------------------------------------------------------- */
function nationalPensionCoefficients(years) {
  // 앵커: (10년, 20년) 구간과 (20년 이상) 구간의 절편(a)·기울기(b)
  var a10 = 171650, b10 = 0.05375;
  var a20 = 257476, b20 = 0.080624;
  var slopeA20plus = 17165, slopeB20plus = 0.005375;

  if (years <= 20) {
    var t = (years - 10) / 10;
    return {
      a: a10 + (a20 - a10) * t,
      b: b10 + (b20 - b10) * t
    };
  }
  return {
    a: a20 + slopeA20plus * (years - 20),
    b: b20 + slopeB20plus * (years - 20)
  };
}

function calcNationalPension(input) {
  var totalMonths = input.years * 12 + input.months;
  var avgIncomeMonthly = input.avgIncomeManwon * 10000; // 만원 -> 원

  if (totalMonths <= 0 || avgIncomeMonthly <= 0) {
    return { error: "가입기간과 평균 소득월액을 올바르게 입력해 주세요." };
  }

  var years = totalMonths / 12;
  var coef = nationalPensionCoefficients(years);
  var monthly = clampNonNegative(coef.a + coef.b * avgIncomeMonthly);

  var eligible = totalMonths >= 120; // 최소 가입기간 10년

  return {
    monthly: monthly,
    yearly: monthly * 12,
    totalMonths: totalMonths,
    eligible: eligible
  };
}

/* -------------------------------------------------------------------------
   국민연금 수급개시연령 (출생연도 기준, 노령연금)
   ------------------------------------------------------------------------- */
function nationalPensionStartAge(birthYear) {
  if (birthYear <= 1952) return 60;
  if (birthYear <= 1956) return 61;
  if (birthYear <= 1960) return 62;
  if (birthYear <= 1964) return 63;
  if (birthYear <= 1968) return 64;
  return 65;
}

/* -------------------------------------------------------------------------
   공무원연금 / 군인연금 / 사학연금 (직역연금 공통 구조)
   연금월액 = 평균기준소득월액 × Σ(재직연도별 적용비율)
   2016년 공무원연금법 개정에 따른 재직기간 1년당 적용비율(신법) 단계적 인하 구조를 근사 반영:
     2015년 이전            : 연 1.9% (구법 단순 근사치)
     2016~2019년            : 1.878% → 1.797% (연 0.027%p씩 단계적 인하)
     2020~2035년            : 1.7% → 1.0% (연 약 0.0467%p씩 단계적 인하)
     2036년 이후             : 1.0% 고정
   군인연금 및 사학연금은 공무원연금 산정방식을 준용하는 구조를 근사 적용합니다.
   ------------------------------------------------------------------------- */
function occupationalAnnualRatePercent(year) {
  if (year <= 2015) return 1.9;
  if (year <= 2019) {
    // 2016: 1.878, 2017: 1.851, 2018: 1.824, 2019: 1.797
    return 1.878 - (year - 2016) * 0.027;
  }
  if (year <= 2035) {
    return 1.7 - (year - 2020) * (0.7 / 15);
  }
  return 1.0;
}

function calcOccupationalPension(input) {
  var totalMonths = input.years * 12 + input.months;
  var avgIncomeMonthly = input.avgIncomeManwon * 10000;

  if (totalMonths <= 0 || avgIncomeMonthly <= 0 || !input.retireYear) {
    return { error: "재직기간, 평균 기준소득월액, 퇴직(예정)연도를 올바르게 입력해 주세요." };
  }

  var serviceYearsFull = totalMonths / 12;
  var startYear = Math.round(input.retireYear - serviceYearsFull);

  var rateSumPercent = 0;
  var yearCount = 0;
  for (var y = startYear; y < input.retireYear; y++) {
    rateSumPercent += occupationalAnnualRatePercent(y);
    yearCount++;
  }
  if (yearCount === 0) {
    rateSumPercent = occupationalAnnualRatePercent(input.retireYear) * serviceYearsFull;
    yearCount = 1;
  }

  // 실제 근무연수(월단위 소수 포함) 비율로 환산
  var avgAnnualRate = rateSumPercent / yearCount;
  var totalRatePercent = avgAnnualRate * serviceYearsFull;

  // 최대 지급률 상한 (근사치: 대략 재직기간 36년 수준에서 포화되는 구조를 단순 반영)
  var cappedRatePercent = Math.min(totalRatePercent, 76.5);

  var monthly = avgIncomeMonthly * (cappedRatePercent / 100);

  var eligible = totalMonths >= 120; // 최소 재직기간 10년 (2016년 이후 임용 기준)

  return {
    monthly: clampNonNegative(monthly),
    yearly: clampNonNegative(monthly) * 12,
    totalMonths: totalMonths,
    ratePercent: cappedRatePercent,
    avgAnnualRate: avgAnnualRate,
    startYear: startYear,
    eligible: eligible
  };
}

/* -------------------------------------------------------------------------
   퇴직연금 DB형 (확정급여형) / 법정 퇴직금
   근로자퇴직급여보장법 기준 근사식: 퇴직급여 ≈ 평균월급 × 근속연수
   (정확히는 1일평균임금×30×(재직일수/365)이지만, 월급을 평균임금으로 보고
   근속연수를 곱하는 표준적인 단순화 방식을 사용합니다.)
   ------------------------------------------------------------------------- */
function calcRetirementDB(input) {
  var avgMonthlyWage = input.avgMonthlyWageManwon * 10000;
  var years = input.years + input.months / 12;

  if (avgMonthlyWage <= 0 || years <= 0) {
    return { error: "평균 월급여와 근속기간을 올바르게 입력해 주세요." };
  }

  var lumpSum = avgMonthlyWage * years;
  var eligible = years >= 1; // 1년 미만 재직 시 퇴직금 지급 의무 없음

  return {
    lumpSum: clampNonNegative(lumpSum),
    years: years,
    eligible: eligible
  };
}

/* -------------------------------------------------------------------------
   투자형 연금 공통 로직 (퇴직연금 DC형 / IRP / 연금저축 / 개인연금)
   매년 일정액을 납입해 지정한 예상 수익률로 복리 운용한다고 가정한
   미래가치(FV) 계산과, 그 금액을 일시금 또는 정해진 기간 동안
   매월 정액으로 나눠 받을 때의 월 수령액(PMT) 계산을 제공합니다.
   ------------------------------------------------------------------------- */
function calcInvestmentAccumulation(input) {
  var initial = input.initialManwon * 10000;
  var annualContribution = input.annualContributionManwon * 10000;
  var years = input.years;
  var rate = input.annualReturnPercent / 100;

  if (years <= 0 || (initial <= 0 && annualContribution <= 0)) {
    return { error: "가입기간과 납입액(또는 초기 자산)을 올바르게 입력해 주세요." };
  }

  var fvInitial = initial * Math.pow(1 + rate, years);
  var fvContributions;
  if (Math.abs(rate) < 1e-9) {
    fvContributions = annualContribution * years;
  } else {
    fvContributions = annualContribution * ((Math.pow(1 + rate, years) - 1) / rate);
  }

  var futureValue = clampNonNegative(fvInitial + fvContributions);

  return {
    futureValue: futureValue,
    years: years,
    annualReturnPercent: input.annualReturnPercent
  };
}

// futureValue를 payoutYears 동안 매월 정액으로 나눠 받을 때의 월 지급액(PMT)
// payoutReturnPercent: 수령 기간 중에도 남은 잔액이 계속 그 수익률로 운용된다는 가정
function calcMonthlyPayout(futureValue, payoutYears, payoutReturnPercent) {
  var months = payoutYears * 12;
  if (months <= 0 || futureValue <= 0) return 0;

  var monthlyRate = (payoutReturnPercent / 100) / 12;
  if (Math.abs(monthlyRate) < 1e-9) {
    return futureValue / months;
  }
  return futureValue * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

/* -------------------------------------------------------------------------
   세금 계산 (참고용 근사치)
   국세청 고시 세율표(2023.1.1 이후 근속연수공제/환산급여공제, 종합소득세
   기본세율)와 연금소득공제표, 사적연금 원천징수세율을 기준으로 계산합니다.
   실제 세액은 다른 소득 유무, 각종 소득/세액공제 등에 따라 달라지므로
   참고용 추정치이며, 정확한 금액은 국세청 홈택스 또는 세무사를 통해
   확인해야 합니다.
   ------------------------------------------------------------------------- */

// 종합소득세 기본세율 (누진공제 포함, 지방소득세 별도)
function progressiveIncomeTax(base) {
  base = clampNonNegative(base);
  if (base <= 14000000) return base * 0.06;
  if (base <= 50000000) return base * 0.15 - 1260000;
  if (base <= 88000000) return base * 0.24 - 5760000;
  if (base <= 150000000) return base * 0.35 - 15440000;
  if (base <= 300000000) return base * 0.38 - 19940000;
  if (base <= 500000000) return base * 0.40 - 25940000;
  if (base <= 1000000000) return base * 0.42 - 35940000;
  return base * 0.45 - 65940000;
}

// 공적연금소득세 근사 (국민연금·직역연금이 유일한 소득이라고 가정한 단순 추정)
function calcPublicPensionTax(annualPensionWon) {
  var w = clampNonNegative(annualPensionWon);
  var deduction;
  if (w <= 3500000) deduction = w;
  else if (w <= 7000000) deduction = 3500000 + (w - 3500000) * 0.4;
  else if (w <= 14000000) deduction = 4900000 + (w - 7000000) * 0.2;
  else deduction = 6300000 + (w - 14000000) * 0.1;
  deduction = Math.min(deduction, 9000000);

  var pensionIncome = clampNonNegative(w - deduction);
  var basicDeduction = 1500000; // 본인 기본공제만 반영 (단순화)
  var taxBase = clampNonNegative(pensionIncome - basicDeduction);
  var incomeTax = progressiveIncomeTax(taxBase);
  var totalTax = clampNonNegative(incomeTax * 1.1); // 지방소득세 10% 포함

  return { annualTax: totalTax, monthlyTax: totalTax / 12 };
}

// 퇴직소득세 (근속연수공제 → 환산급여 → 환산급여공제 → 세율 적용, 지방소득세 포함)
function calcRetirementIncomeTax(lumpSum, years) {
  lumpSum = clampNonNegative(lumpSum);
  years = Math.max(1, Math.round(years));

  var serviceDeduction;
  if (years <= 5) serviceDeduction = years * 1000000;
  else if (years <= 10) serviceDeduction = 5000000 + (years - 5) * 2000000;
  else if (years <= 20) serviceDeduction = 15000000 + (years - 10) * 2500000;
  else serviceDeduction = 40000000 + (years - 20) * 3000000;

  var afterServiceDeduction = clampNonNegative(lumpSum - serviceDeduction);
  var convertedWage = (afterServiceDeduction / years) * 12;

  var wageDeduction;
  if (convertedWage <= 8000000) wageDeduction = convertedWage;
  else if (convertedWage <= 70000000) wageDeduction = 8000000 + (convertedWage - 8000000) * 0.6;
  else if (convertedWage <= 100000000) wageDeduction = 45200000 + (convertedWage - 70000000) * 0.55;
  else if (convertedWage <= 300000000) wageDeduction = 61700000 + (convertedWage - 100000000) * 0.45;
  else wageDeduction = 151700000 + (convertedWage - 300000000) * 0.35;

  var taxBase = clampNonNegative(convertedWage - wageDeduction);
  var annualizedTax = progressiveIncomeTax(taxBase);
  var retirementTax = (annualizedTax / 12) * years;
  var totalTax = clampNonNegative(retirementTax * 1.1); // 지방소득세 10% 포함

  return { tax: totalTax, effectiveRate: lumpSum > 0 ? totalTax / lumpSum : 0 };
}

// 퇴직연금을 "연금" 형태로 수령할 때의 퇴직소득세 감면 (수령 1~10년차 30%, 11년차 이후 40% 감면)
function retirementPensionTaxDiscountRate(payoutYears) {
  return payoutYears <= 10 ? 0.3 : 0.4;
}

// 사적연금소득세 (연금저축·IRP를 "연금" 형태로 수령 시, 연 1,500만원 이하 분리과세 가정)
function privatePensionTaxRate(age) {
  if (age >= 80) return 0.033;
  if (age >= 70) return 0.044;
  return 0.055; // 55~69세
}

// 이자소득세 (개인연금보험 등 10년 미만 유지 시 차익 부분에 과세, 지방소득세 포함)
var INTEREST_INCOME_TAX_RATE = 0.154;

// 공적연금(국민연금·직역연금) 세전/세후 표 행 HTML
function publicPensionTaxRowsHtml(monthly) {
  var tax = calcPublicPensionTax(monthly * 12);
  var afterTax = clampNonNegative(monthly - tax.monthlyTax);
  return (
    '<tr><th>세전 월 수급액</th><td>' + formatWon(monthly) + '</td></tr>' +
    '<tr><th>예상 세금 (연금소득세, 단독소득 가정)</th><td>-' + formatWon(tax.monthlyTax) + '</td></tr>' +
    '<tr><th>세후 실수령액 (추정)</th><td><strong>' + formatWon(afterTax) + '</strong></td></tr>'
  );
}

// IRP·연금저축 공통: 세전/세후 결과 표 HTML (세액공제받은 사적연금 기준)
// 연금형 수령: 나이별 연금소득세(3.3~5.5%). 일시금 수령: 기타소득세 16.5% 근사 적용(지방소득세 포함).
function privatePensionResultTableHtml(futureValue, years, annualReturnPercent, payoutType, payoutYears, returnRate, startAge) {
  var html = '<table class="result-table">';
  html += '<tr><th>운용 기간</th><td>' + years + '년</td></tr>';
  html += '<tr><th>적용 수익률</th><td>연 ' + annualReturnPercent + '%</td></tr>';

  if (payoutType === "monthly" && payoutYears > 0) {
    var monthly = calcMonthlyPayout(futureValue, payoutYears, returnRate);
    var rate = privatePensionTaxRate(startAge || 55);
    var monthlyAfterTax = monthly * (1 - rate);
    html += '<tr><th>연금소득세율 (만 ' + (startAge || 55) + '세 기준)</th><td>' + (rate * 100).toFixed(1) + '%</td></tr>';
    html += '<tr><th>세후 월 지급액 (추정)</th><td><strong>' + formatWon(monthlyAfterTax) + '</strong></td></tr>';
  } else {
    var otherIncomeTaxRate = 0.165;
    var afterTax = futureValue * (1 - otherIncomeTaxRate);
    html += '<tr><th>기타소득세 (일시금 수령, 지방소득세 포함 약 16.5%)</th><td>-' + formatWon(futureValue * otherIncomeTaxRate) + '</td></tr>';
    html += '<tr><th>세후 실수령액 (추정)</th><td><strong>' + formatWon(afterTax) + '</strong></td></tr>';
  }
  html += '</table>';
  return html;
}

/* -------------------------------------------------------------------------
   폼 유틸리티
   ------------------------------------------------------------------------- */
function getNumberValue(id) {
  var el = document.getElementById(id);
  if (!el) return NaN;
  var v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}

function showError(panelId, message) {
  var panel = document.getElementById(panelId);
  panel.innerHTML =
    '<div class="error-box">⚠ ' + message + "</div>" +
    '<div class="result-empty"><div class="icon">🧮</div><p>입력값을 확인한 뒤 다시 계산해 주세요.</p></div>';
}
