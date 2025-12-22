export const parseArgs = (argv) => {
  const args = { date: undefined, project: undefined, json: false, skipXlm: false, requireXlm: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const val = argv[i];
    if (val === '--date' || val === '-d') {
      args.date = argv[i + 1];
      i += 1;
    } else if (val === '--project' || val === '-p') {
      args.project = argv[i + 1];
      i += 1;
    } else if (val === '--json') {
      args.json = true;
    } else if (val === '--skip-xlm') {
      args.skipXlm = true;
    } else if (val === '--require-xlm') {
      args.requireXlm = true;
    }
  }
  return args;
};
