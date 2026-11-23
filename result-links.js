// type と mode が共にない URL はトップページとして扱います。
function readResultLink(address) {
  const { searchParams } = new URL(address);
  const codes = searchParams.getAll('type');
  const resultModes = searchParams.getAll('mode');
  if (!codes.length && !resultModes.length) return { screen: 'home' };
  const [code] = codes;
  const [mode] = resultModes;
  if (codes.length !== 1 || resultModes.length !== 1
      || !Object.hasOwn(types, code) || !Object.hasOwn(modes, mode)) {
    return { screen: 'error' };
  }
  return { screen: 'result', code, mode };
}

function makeResultLink(address, code, mode) {
  const url = new URL(address);
  url.search = '';
  url.hash = '';
  if (code && mode) {
    url.searchParams.set('type', code);
    url.searchParams.set('mode', mode);
  }
  return url.href;
}
