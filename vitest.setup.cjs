globalThis.fetch = () => { throw new Error('Network access is disabled in unit tests'); };
globalThis.WebSocket = class { constructor() { throw new Error('Network access is disabled in unit tests'); } };
globalThis.XMLHttpRequest = class { constructor() { throw new Error('Network access is disabled in unit tests'); } };
