import { selectAllTokens, selectTokenBoostAmounts, selectTokenPresent } from "../db";

(async () => {
  const query = false;
  if (query) {
    const res = await selectAllTokens();
    console.log(res);
  }
})();

(async () => {
  const token = null;
  if (token) {
    const res = await selectTokenPresent(token);
    console.log(res);
  }
})();

(async () => {
  const token = null;
  if (token) {
    const res = await selectTokenBoostAmounts(token);
    console.log(res);
  }
})();
