/**
 * Matrice étendue des Golden Hash (Phase 3D-C2), exécutée uniquement en test
 * long isolé. Les 18 références historiques restent la source de vérité dans
 * `tests/decision-golden-hash.test.ts` ; les valeurs ci-dessous les reprennent
 * et figent les 78 scénarios supplémentaires (6 profils × 4 effectifs × 4 horizons).
 *
 * La variable `GENERATE_GOLDEN_MATRIX=1` permet de régénérer explicitement la
 * matrice ; elle ne doit jamais être utilisée en validation ordinaire.
 */
import { describe, expect, it } from 'vitest';
import { computeGoldenScenarioHash } from './worker-tick-fixtures';

const PROFILES = [
  'optimiste résilient', 'anxieux peu résilient', 'discipliné',
  'impulsif', 'très sociable', 'indépendant',
];
const COUNTS = [1, 2, 10, 50];
const TICKS = [24, 72, 168, 720];

/** Références mesurées avec le canonicaliseur partagé, y compris les 18 historiques. */
const EXPECTED: Record<string, string> = {
  'anxieux peu résilient|10|168': '34075934fd0a23ca84e0af6b6b3c7ebddf2c44ce35339eeadaa9f6f6c55d47e5',
  'anxieux peu résilient|10|24': '23a891c6e54b8e41b975a0b2b7c1dca38ae5c47f3f0e12a17031865131502161',
  'anxieux peu résilient|10|72': 'c124303323fc46ad6b9fde76956faf7a6fee2ec4f4f2317d590396eda1b768ee',
  'anxieux peu résilient|10|720': '5f247bb27b0fa1e7b510e696497e000542015719ba11af10511a036888de8d61',
  'anxieux peu résilient|1|168': '71bee2b2df03d2ac51933a841a8e1b02f851fc8b1ce4d026b3c3efb7fd87bb38',
  'anxieux peu résilient|1|24': '89b689184d4b0009deedef3acc55d47d8e32eb30f0259f91a6789814a1e25907',
  'anxieux peu résilient|1|72': '7f0fa05797f649008818a2624f68f5a66a5a5ffc47d9f637a743be813fbc219d',
  'anxieux peu résilient|1|720': 'c6541d8f1ad6f0b433c5f14d3273f7c1c84ac85cda76ee4ef57b9fe5910f185e',
  'anxieux peu résilient|2|168': 'ace6a1bd06fb227fc58920eb3378004cde998fd9c4b501ecb0c42f7474232c69',
  'anxieux peu résilient|2|24': '0e852ab0c92385daa57edcd67c6a756a1aa14622108d2976b2739bcb8305df60',
  'anxieux peu résilient|2|72': '24d22003982e34161d9172a5f3f3883f682a169d2290d2310121bae700738a66',
  'anxieux peu résilient|2|720': '63abb72ac35c8d05ef278f7627e4690307dfde8eee119ac2c98476673c998751',
  'anxieux peu résilient|50|168': '27bde915500b1c712623383596e2c141e2c29b865af4abdd68560a12af2e1764',
  'anxieux peu résilient|50|24': '183d869731d44b54fcfbe6207889fa639220d0fc6099266ee479ea41955d6fbe',
  'anxieux peu résilient|50|72': 'ca811867b986c18612e554fcac6c58cefe6ce0e41e84e87d96df681f19e436fa',
  'anxieux peu résilient|50|720': 'e342f5996a12b89eaaa2b5ff0b5aee4d620835295d90695e8d742f0d1fde2f62',
  'discipliné|10|168': 'af8853c700ba764fe5699116c4f8848c1bd47d605c05463f6c251acffcfe53ad',
  'discipliné|10|24': 'dd4d070df399e5f70cd6b6ba1da7119ba7855ca11ce5967476a370da048228fd',
  'discipliné|10|72': '667527ba6f8520eedfa6a6cebf78f4cbceba00af34d324535ae2681f174dbb9c',
  'discipliné|10|720': 'd4ab9ed33f94dda016c7598503ab8385c23c62b7cec2a8569022949a3cf831ba',
  'discipliné|1|168': 'e6c1167ecae0ed2a7d95967596b9e493863d8fb59e50a7e67204aa5e07eb0448',
  'discipliné|1|24': '74e090f215bab478a0456417de246c1bf1d0701f96ab80e28dfb63801fd5cdfa',
  'discipliné|1|72': '0642019da23b1456501991f9042e71895730cd6a30714cf60c595af56dd81110',
  'discipliné|1|720': '53834d31f386bc0165ae36827ccd8765005740efffaac47161f3b38ef1df3e61',
  'discipliné|2|168': 'a429d3409e9368d23d8dc480d2f80c9ccf821951cbbbdd6e9f3519a2f14a631e',
  'discipliné|2|24': '2cea07989a75588fca53439bef28edac30725157b2f490f3095f793f3ea2b5a1',
  'discipliné|2|72': 'd712b7b7b81e093d35d451c49bbb4bc9c390e4e3dd4de6d3fba6e56bf1e2bafb',
  'discipliné|2|720': '037643bf73c5d39e3a90b47c45d18cb1f7a63663c09861844019a77874426862',
  'discipliné|50|168': '4f5137924dc4bfbd02e076f3566f22a2bd8ad84b429dd861b1337784bf548415',
  'discipliné|50|24': 'ebe2566c9a9eecfd0baf68793f8e16b045a89a9343c3a917397eaeb50ae0fd6b',
  'discipliné|50|72': '3e5cd4cb81ddfa5513e206a477d6db82ddf2e2f89ed64ab32a6bafadd3b1d454',
  'discipliné|50|720': 'af8c9e02acd041d94d6df651362bec8ccd0cf0ded3ed6e09f417894040df4513',
  'impulsif|10|168': '955519a7c8dfd6ca665cf306db1c25466ca6ed2fa0341e9fcb23b53cee381b15',
  'impulsif|10|24': '6d66b3f76f0bd5fc5df188cc76115ddadb895174f8d9555fd98d6451102acdfa',
  'impulsif|10|72': 'edf4bcf68e39a980cf734e829bd931806cdf8c42931e47b387db22ce0b3dc175',
  'impulsif|10|720': '3a1347ab6f1bdcd04d85b7c6249f125bcd18b42e66efa216b6b3d06285e7b5ad',
  'impulsif|1|168': 'e70b381eb3d5860a918808cb8802b8b21869b3bb8cc890dd6c747879a7920c5c',
  'impulsif|1|24': 'ab4efc0640f52435120cda82badedc90f3b7bfddf2ead854d470ac05bf99eec3',
  'impulsif|1|72': '1d69b09ec9c2928052d7ba571ea2b27881253710a2f35099f05132739050e92b',
  'impulsif|1|720': '3542ef14c9774496f84a1628068c5c12461387d6326499fa2822ecd9711789a2',
  'impulsif|2|168': '27ec82b63f272a99bd26790595e98bdb012994505a8608649214229e58807c46',
  'impulsif|2|24': '17faa4fa1e9107bdf29893d08fb2b7ad197fbae1a3ddc39fd6c0ab85f9ac4420',
  'impulsif|2|72': '4d370af225094cf1985b747b8f7a8c87be905923b4bd72b270acebe8ab2ddb7b',
  'impulsif|2|720': '938fa7407cdcdb9192afb73416038f420366cfcb448a1eca4760e18a1313b2e8',
  'impulsif|50|168': '73291713bca0394cb4789753d47795a3206fca3e8c91503132bf0e6a64fbd0b2',
  'impulsif|50|24': '455537a75ecb9e0fee51510025f2003883e7a960125aace1f1741beb86128301',
  'impulsif|50|72': 'f3df8459baf665fc6c11a6aa50b369405d91cf5f93390624f9d6d0478dd5271e',
  'impulsif|50|720': '2970ac625e664f074d77b7fb4aeb79f59f0a5bc6dc35d28332b34f8c708fb5a2',
  'indépendant|10|168': '305ba88334864d9c901d113991efdc88de50d0ffb238ce487cf63f1c9c462094',
  'indépendant|10|24': '29c04d3579af073eaca61d2d02ac3e7d7232b078aa02b8c3f0d2130e2303637b',
  'indépendant|10|72': '6c94b3794b2054f3fc768f4abf9af86040d1ebeee6731c3ee0dae35cf972fa11',
  'indépendant|10|720': 'cc822d67402e050134682c452f975e95b215bb5c3640cc47d72fdd14cf0da968',
  'indépendant|1|168': 'ef978ad2b4633cfe2806fcbe1306f19a68647e8f6bec550d7a3e913d73dc0237',
  'indépendant|1|24': '34b2d8aabe180b39e2f9dcadd48c1d21d5c61a53509d66f670d29a6df6138e81',
  'indépendant|1|72': '836a216be8f2b8209c1586dc004472116db0789727ef0f3141f9a2375df45ae2',
  'indépendant|1|720': 'be9cd0d0691492ea50d11c001573d940c7f4ad3abfc8447a7ad751ff071a31dc',
  'indépendant|2|168': 'a0fdade4afd431478ba5e9035127f4b77035526621072a1659780fd759195b27',
  'indépendant|2|24': '0b6d0f883eecee07abd2e42300266812dc5cbb932c7769c1f5156c074f0b33a3',
  'indépendant|2|72': 'e07a7852a883e04613fc027ae92e89605554963086e9de222e88cbb0cc90ff63',
  'indépendant|2|720': 'e0322ea2f5c1a2538f23f1a5dd00bd2f7eb39f28a3eb41beca5f12b268b4aeb0',
  'indépendant|50|168': 'bd58d21f7f42b4d6f8b33c24c862bf5e9a45a08bfe962d4148501bc1923388f4',
  'indépendant|50|24': '57ea4b7450cd68a7bab7df7e549b92c65d4990cc3dc7a21cc5a798ec4b52ec4a',
  'indépendant|50|72': '36163d83c574a1be3109b97dc66776c68daac664d9f9020eb62070e832852175',
  'indépendant|50|720': '2c04b181b9ddcc51569f8fcd9cb441bc513d005da4e28d875211e7fb428b46a2',
  'optimiste résilient|10|168': '6e408ec5f27e290538f60d05383f48fd3a394fcf088501ac8f9c83300b4862ab',
  'optimiste résilient|10|24': 'ca075a830addfdd97eace6bd5186df3c4c0fbd4d96af04eb5bc52b995b270dc5',
  'optimiste résilient|10|72': 'aeaefbbcafeff965712effd61ee03a111bc96e7cd5d8f1d28e46fa486fc106e2',
  'optimiste résilient|10|720': 'c52c72c5ff8328f8fc8d76e48f1c2113a90e013507cc89ef0ac266f0de1453ec',
  'optimiste résilient|1|168': '78009560cd1a902a1bd550558465ef26dad496e8d1c4187aaa82e469e405ef39',
  'optimiste résilient|1|24': 'f2f9e89ba2aeb14acead15c238ef728242a213a8c4187d7c27ce86066309e2e0',
  'optimiste résilient|1|72': '9445ed9b9fb7745ede8a33aa1c0a13ce86c0622ea9d48a8472c53db313eda0e7',
  'optimiste résilient|1|720': 'd04aaa45719768fa4733c0450a8ba96e901583ef5bd26bfe8edc0dc18ad9ed30',
  'optimiste résilient|2|168': '808d75c16f702a48fe0b0247eab6870f065f5f68a56b89c29ab3404bc0f26187',
  'optimiste résilient|2|24': 'b0202dcfb5758907a963cb42299a521cfeeb897f68cc42b5e386f8b9a9e3937f',
  'optimiste résilient|2|72': 'e93a820e62e971f6c66c8358cd72147dbaf84fc932ef22db19dba3da48453507',
  'optimiste résilient|2|720': 'a0a958962524d2ab91dce109a1a412dc2f35dda5ce7eee85b06ae02b5308aa78',
  'optimiste résilient|50|168': '4a6deb41813daba76d009f67b19980cd23efba0853696df44ea47292f5981ff8',
  'optimiste résilient|50|24': '6947e666f23150e531fcce534a890290227f568c6dda19eb7c39bee8e555356a',
  'optimiste résilient|50|72': '63a708e045acc3b871455ba30fce681db9893ac441042ff4346fabad93924130',
  'optimiste résilient|50|720': 'b308e915b48d4cf331ea58bf6d407edadb07727843cf60e22cdb2e89777566b4',
  'très sociable|10|168': 'b022fd37c0417476fe73f300368a06b74af143e6a9f0c76cb16a28cc8d63dc1d',
  'très sociable|10|24': 'c66d9ee0c80d0abe1ee09859fea085737127ed81bd04e0f3b065ac08067b0eea',
  'très sociable|10|72': '50ae6c69f59164275fae8e28034c18f700676ab84f9c6d568cc30a55f7e9e7b8',
  'très sociable|10|720': '1fa8eab79755abb96e91fda944ef9532b925a3d013c32e56f301b31e29452643',
  'très sociable|1|168': '6de7a98a7b563ba3e682810662086b31c13d6a8f16c23ee09832ce1ac7922260',
  'très sociable|1|24': '627c7e4a33bca5a2b8023555c347d3ceac4a64b737ffa49d24f84dcb9d394864',
  'très sociable|1|72': 'f872c5a8fe4136b19966cd32ccb5d1565b1176d508d8f1fabae81a13006593ad',
  'très sociable|1|720': '734559d1e390800f2f43883dcfec9903c767b4f0d4782589e76a2173677a5695',
  'très sociable|2|168': '18a43c3b0912b94178badf0bea7fba2414185392767ec14cad050c1a0740a366',
  'très sociable|2|24': 'c3ab7e84b2db84fa103492947ac017c8f025399760d8c155f94bd3628536fdec',
  'très sociable|2|72': '9418193e3b4c9975eef7c2e441d4eb9c730fbdc358a01b8b03ccd10c3df4bb52',
  'très sociable|2|720': '393acfd76a27fd5d430f650ac328ae1a8ac3c15af0a4b80e28410ec3dd56b714',
  'très sociable|50|168': 'a80647c958c60d168859ecf9f2d7d2a74952e2f321172731eab8f0c6bc10db42',
  'très sociable|50|24': '2723e2c0a7e2c3a9e306e27be4b6fae3173e50cdd7268e765540d0d62c8b4b80',
  'très sociable|50|72': '2ff0e73124252d1c501823a954f1a9f51038f0ec67d44967b6e55b2d68d46fd3',
  'très sociable|50|720': '2a933821fa4dd043fb48d09040b9b83dbdfb9c2eb238db93433e2637822ddd8e',
};

const generate = process.env.GENERATE_GOLDEN_MATRIX === '1';

describe('matrice étendue Golden Hash — PROFILS × COUNTS × HORIZONS', () => {
  for (const profile of PROFILES) {
    for (const count of COUNTS) {
      for (const ticks of TICKS) {
        const key = `${profile}|${count}|${ticks}`;
        it(key, () => {
          const actual = computeGoldenScenarioHash(profile, count, ticks);
          if (generate) {
            console.log(`GOLDEN_MATRIX '${key}': '${actual}',`);
            expect(actual).toMatch(/^[a-f0-9]{64}$/);
            return;
          }
          expect(actual).toBe(EXPECTED[key]);
        }, 180_000);
      }
    }
  }
});
