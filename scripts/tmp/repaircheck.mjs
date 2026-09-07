import { readCsv } from '../lib/csv.mjs';
const f = 'E:/Apollo Database 99,311,285/Entire Apollo Database 99,311,285/Apollo_V7_V5_org_all_fields 6,071,657.csv';
for (const expect of [0, 51]) {
  let n = 0, withId = 0, withIndex = 0, badFunding = 0;
  for await (const r of readCsv(f, { delimiter: '\t', expectFields: expect })) {
    if ((r.organization_id || '').trim()) withId++;
    if ((r._index || '').trim()) withIndex++;
    const fa = (r.organization_latest_funding_round_amount_long || '').trim();
    if (fa.startsWith('{')) badFunding++;
    if (++n >= 200000) break;
  }
  console.log(`expectFields=${expect}: rows=${n} hasOrgId=${(100*withId/n).toFixed(1)}% has_index=${(100*withIndex/n).toFixed(1)}% fundingCorrupt=${badFunding}`);
}
