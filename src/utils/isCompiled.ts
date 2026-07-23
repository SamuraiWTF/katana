// Macro as a janky workaround because Bun's documentation claims Bun.isStandaloneExecutable should tell this
// But it doesn't. Type definitions don't even show that property on the Bun object, and it's always undefined
// regardless of whether we build or run locally. 
export function isCompiled() {
  return Boolean(Bun.env.KATANA_COMPILED);
}