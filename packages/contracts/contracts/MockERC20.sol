// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockERC20 — testnet mock token (docs/mimari-kararlar.md I-008, AP-002)
/// @notice Vault'ın Sepolia / BSC Testnet / Tron Shasta üzerinde kullandığı mock
///         ERC-20/TRC-20 token'ı. Gerçek bir varlık değildir; yalnızca admin
///         `mint()` ile test bakiyesi dağıtabilsin diye vardır
///         (docs/01_DOMAIN_MODEL.md §2.10 MintOperation).
/// @dev Deploy eden cüzdan `onlyOwner`'dır ve Faz 4 §4.4b'de `POST /admin/mint`
///      bu owner adına `mint()` çağırır — bu yüzden deployer private key'i
///      `apps/api/.env`'e `MINT_OPERATOR_PRIVATE_KEY` olarak aynen kopyalanır
///      (docs/04_BACKEND_SPEC.md §10).
contract MockERC20 is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {
        _decimals = decimals_;
    }

    /// @notice Token'ın ondalık hassasiyeti (ör. USDT için 6) —
    ///         `assets.decimals` (docs/02_DATABASE_SCHEMA.md §2.3) ile eşleşir.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Hedef adrese yeni token basar. Yalnızca owner (deployer) çağırabilir.
    /// @param to Bakiyeyi alacak cüzdan adresi
    /// @param amount En küçük birimde (decimals'a göre) basılacak miktar
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
