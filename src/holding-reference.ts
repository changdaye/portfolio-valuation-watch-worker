export const HOLDING_REFERENCE: Record<string, string> = {
  '513050': '中概互联',
  '159525': '红利低波ETF富国',
  '520500': '恒生新药',
  '513310': '中韩芯片',
  '159202': '恒生互联网ETF',
  '159502': '标普生科',
  '513180': '恒指科技',
  '510050': '50ETF',
  '159938': '医药',
  '510580': 'ZZ500ETF',
  '159934': '黄金ETF易方达',
  '588000': '科创50ETF华夏',
  '159920': '恒生ETF华夏',
  '159659': '纳斯达克100ETF',
  '513500': '标普500',
  '159949': '创业板50ETF',
};

export function describeHoldings(codes: string[]): string {
  return codes.map((code) => HOLDING_REFERENCE[code] ? `${HOLDING_REFERENCE[code]}(${code})` : code).join(' / ');
}

export function describeHoldingNames(codes: string[]): string {
  return codes.map((code) => HOLDING_REFERENCE[code] ?? code).join(' / ');
}
