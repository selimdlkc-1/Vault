// Mock ERC-20 / TRC-20 `mint()` ABI parçası — İterasyon 4'ün Solidity kaynağıyla
// (`packages/contracts/contracts/MockERC20.sol`) elle senkron tutulur. Kontrat
// arayüzü sabittir (`function mint(address to, uint256 amount) external onlyOwner`),
// otomatik ABI üretimi bu ölçekte gerekmez (Faz 4 §4.4b, `docs/mimari-kararlar.md`
// AP-002/I-008).
//
// `apps/api` bu paketi runtime'da import eder ama `packages/contracts`'ı **etmez**
// (`docs/mimari-kararlar.md` TS-008) — mint çağrısı bu minimal ABI ile yapılır.

/** ethers v6 human-readable ABI (`EvmProvider.mintToken`). */
export const MOCK_ERC20_ABI = [
  "function mint(address to, uint256 amount) external",
] as const;

/** tronweb JSON ABI karşılığı (`TronProvider.mintToken`). */
export const MOCK_TRC20_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
