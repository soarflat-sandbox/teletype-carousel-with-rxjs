/**
 * イベントのオプション出し分け
 */
export const enablePassiveEventListeners = () => {
  let result = false;

  const opts =
    Object.defineProperty &&
    Object.defineProperty({}, 'passive', {
      get: () => {
        result = true;
      },
    });

  document.addEventListener('test', () => {}, opts);

  return result;
};
