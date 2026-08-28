/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  moduleFileExtensions: ["js", "json", "ts"],
  // packages/chain-providers kritik modüldür (docs/08 §3); coverage eşiği CI
  // gate'i olarak Faz 7 §7.1'de eklenecek, testler baştan bu hedefi gözetir.
  collectCoverageFrom: ["**/*.ts", "!**/*.spec.ts", "!index.ts"],
};
