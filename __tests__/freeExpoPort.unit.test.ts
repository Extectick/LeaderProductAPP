const {
  normalizePathForMatch,
  ownsExpoProcess,
} = require('../scripts/freeExpoPort');

describe('freeExpoPort ownership guard', () => {
  const projectRoot = 'C:\\Share\\GitRepositories\\LeaderProductMobile\\LeaderProductAPP';

  it('recognizes an Expo listener from this project', () => {
    expect(ownsExpoProcess({
      commandLine: '"node" "C:\\Share\\GitRepositories\\LeaderProductMobile\\LeaderProductAPP\\node_modules\\expo\\bin\\cli"',
    }, projectRoot)).toBe(true);
  });

  it('does not allow terminating Expo from another project', () => {
    expect(ownsExpoProcess({
      commandLine: '"node" "C:\\OtherApp\\node_modules\\expo\\bin\\cli"',
    }, projectRoot)).toBe(false);
  });

  it('does not allow terminating an unrelated server in this project', () => {
    expect(ownsExpoProcess({
      commandLine: '"node" "C:\\Share\\GitRepositories\\LeaderProductMobile\\LeaderProductAPP\\scripts\\server.js"',
    }, projectRoot)).toBe(false);
  });

  it('normalizes Windows paths for stable comparisons', () => {
    expect(normalizePathForMatch('C:\\Work\\APP')).toBe('c:/work/app');
  });
});
