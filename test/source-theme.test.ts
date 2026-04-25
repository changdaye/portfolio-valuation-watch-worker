import { describe, expect, it } from 'vitest';
import { extractHtmlTable } from '../src/services/source-theme';

describe('extractHtmlTable', () => {
  it('extracts headers and rows from a legulegu-style table', () => {
    const table = extractHtmlTable(`
      <table>
        <thead><tr><th>时间</th><th>市盈率</th></tr></thead>
        <tbody>
          <tr><td>2026-03-31</td><td>17.45</td></tr>
          <tr><td>2026-02-28</td><td>16.20</td></tr>
        </tbody>
      </table>
    `);

    expect(table.headers).toEqual(['时间', '市盈率']);
    expect(table.rows[0]).toEqual(['2026-03-31', '17.45']);
  });
});
