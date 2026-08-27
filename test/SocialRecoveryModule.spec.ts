import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { SignMessageLib, SocialRecoveryModule, TestExecutor } from "../typechain-types";
import { BigNumber } from "@ethersproject/bignumber";
import { getEIP712Domain, getEIP712Message, getEIP712Types } from "./utils/eip712_helper";

describe("SocialRecoveryModule", async () => {
  let deployer: SignerWithAddress, owner1: SignerWithAddress, owner2: SignerWithAddress;
  let newOwner1: SignerWithAddress, newOwner2: SignerWithAddress, newOwner3: SignerWithAddress;
  let guardian1: SignerWithAddress, guardian2: SignerWithAddress, guardian3: SignerWithAddress, notGuardian: SignerWithAddress;

  const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
  const SENTINEL_ADDRESS = "0x0000000000000000000000000000000000000001";

  before(async () => {
    [deployer, owner1, owner2, newOwner1, newOwner2, newOwner3, guardian1, guardian2, guardian3, notGuardian] =
      await hre.ethers.getSigners();
  });

  async function setupTests() {
    // await deployments.fixture();
    const guardianStorage = await ethers.deployContract("GuardianStorage", [], { signer: deployer });
    const socialRecoveryModule = await ethers.deployContract(
      "SocialRecoveryModule",
      [3600],
      { signer: deployer },
    );
    const account = await hre.ethers.deployContract("TestExecutor", [], { signer: deployer });
    await account.testSetup([owner1.address, owner2.address], 1, ADDRESS_ZERO, [await socialRecoveryModule.getAddress()]);
    //
    return { account, socialRecoveryModule, guardianStorage };
  }

  async function setupTestsWithModuleAsFallbackHandler() {
    const socialRecoveryModule = await ethers.deployContract("SocialRecoveryModule", [3600], { signer: deployer });
    const account = await hre.ethers.deployContract("TestExecutor", [], { signer: deployer });
    await account.testSetup([owner1.address, owner2.address], 1, socialRecoveryModule.target, [await socialRecoveryModule.getAddress()]);
    return { account, socialRecoveryModule };
  }

  async function _addGuardianWithThreshold(
    socialRecoveryModule: SocialRecoveryModule,
    account: TestExecutor,
    guardian: string,
    threshold: number,
  ) {
    const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian, threshold]);
    await account.exec(socialRecoveryModule.target, 0, data);
  }

  async function _getMultiConfirmRecoveryData(
    socialRecoveryModule: SocialRecoveryModule,
    account: TestExecutor,
    newOwners: string[],
    newThreshold: number,
    guardians: SignerWithAddress[],
    execute: boolean,
    _messWithSort: boolean,
    _messWithNonce: boolean,
    _messWithSignaturesArray: boolean,
    _sender: SignerWithAddress | undefined,
  ) {
    guardians.sort((a, b) => (BigNumber.from(a.address).gt(BigNumber.from(b.address)) ? (_messWithSort ? -1 : 1) : _messWithSort ? 1 : -1));
    let nonce = BigInt(await socialRecoveryModule.nonce(account.target));
    nonce = _messWithNonce ? nonce + 1n : nonce;
    let signaturesData: SocialRecoveryModule.SignatureDataStruct[] = [];
    for (const guardian of guardians) {
      let signature = await guardian.signTypedData(
        await getEIP712Domain(socialRecoveryModule),
        getEIP712Types(),
        await getEIP712Message(account, newOwners, newThreshold, nonce),
      );
      if (_sender && _sender.address.toLowerCase() === guardian.address.toLowerCase()) {
        signature = "0x";
      }
      signaturesData.push({
        signer: guardian.address,
        signature,
      });
    }
    if (_messWithSignaturesArray) {
      signaturesData = [];
    }
    return socialRecoveryModule.interface.encodeFunctionData("multiConfirmRecovery", [
      account.target,
      newOwners,
      newThreshold,
      signaturesData,
      execute,
    ]);
  }

  async function confirmRecovery(
    socialRecoveryModule: SocialRecoveryModule,
    account: TestExecutor,
    newOwners: string[],
    newThreshold: number,
    guardians: SignerWithAddress[],
  ) {
    const sender = guardians[0];
    if (guardians.length === 1) {
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [account.target, newOwners, newThreshold, false]);
      await sender.sendTransaction({ to: socialRecoveryModule.target, data });
    } else {
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        newOwners,
        newThreshold,
        guardians,
        false,
        false,
        false,
        false,
        sender,
      );
      await sender.sendTransaction({ to: socialRecoveryModule.target, data });
    }
  }

  async function _deploySafeGuardian(owner: SignerWithAddress) {
    const fallbackHandler = await ethers.deployContract("CompatibilityFallbackHandler", [], { signer: deployer });
    const signMessageLib = await ethers.deployContract("SignMessageLib", [], { signer: deployer });
    const safeGuardian = await ethers.deployContract("TestExecutor", [], { signer: deployer });
    // the deployer is enabled as a module so that tests can make the Safe guardian delegatecall into SignMessageLib
    await safeGuardian.testSetup([owner.address], 1, fallbackHandler.target, [deployer.address]);
    return { safeGuardian, signMessageLib };
  }

  async function _safeGuardianApproveHash(safeGuardian: TestExecutor, signMessageLib: SignMessageLib, hash: string) {
    const message = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [hash]);
    const data = signMessageLib.interface.encodeFunctionData("signMessage", [message]);
    await safeGuardian.connect(deployer).execTransactionFromModule(signMessageLib.target, 0, data, 1);
  }

  function _sortSignatures(signatures: SocialRecoveryModule.SignatureDataStruct[]) {
    return signatures.sort((a, b) => (BigInt(a.signer as string) < BigInt(b.signer as string) ? -1 : 1));
  }

  describe("Multi Confirm Recovery", async () => {
    it("reverts if account has no guardians", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: empty guardians");
    });
    it("reverts if new owners array is empty", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [],
        0,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: owners cannot be empty");
    });
    it("reverts if threshold is 0", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        0,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new threshold");
    });
    it("reverts if threshold is higher than new owners length", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        3,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new threshold");
    });
    it("reverts if a new owner is the zero address", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, ADDRESS_ZERO],
        1,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new owner");
    });
    it("reverts if a new owner is the sentinel address", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, SENTINEL_ADDRESS],
        1,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new owner");
    });
    it("reverts if a new owner is the wallet itself", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, await account.getAddress()],
        1,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new owner");
    });
    it("reverts if a new owner is a guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, guardian2.address],
        1,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: new owner cannot be guardian",
      );
    });
    it("reverts if new owners contain duplicates", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address, newOwner1.address],
        1,
        [guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: duplicate new owner");
    });
    it("reverts if signatures field is empty", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1],
        false,
        false,
        false,
        true,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: empty signatures");
    });
    it("reverts if invalid guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [notGuardian],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: Signer not a guardian");
    });
    it("reverts if invalid nonce", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1],
        false,
        false,
        true,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: Invalid guardian signature",
      );
    });
    it("reverts if invalid signers ordering", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1, guardian2],
        false,
        true,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: duplicate signers/invalid ordering",
      );
    });
    it("reverts if duplicate guardian signature", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1, guardian1],
        false,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: duplicate signers/invalid ordering",
      );
    });
    it("reverts if empty signature is not a guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1, notGuardian],
        false,
        false,
        false,
        false,
        notGuardian,
      );
      await expect(notGuardian.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: sender not a guardian");
    });
    it("reverts if relayed empty signature belongs to an EOA guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1, guardian2],
        false,
        false,
        false,
        false,
        guardian2,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: Invalid guardian signature",
      );
    });
    it("reverts if relayed empty signature belongs to a Safe that is not a guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const { safeGuardian, signMessageLib } = await _deploySafeGuardian(guardian2);
      const newOwners = [newOwner1.address];
      const nonce = await socialRecoveryModule.nonce(account.target);
      const recoveryHash = await socialRecoveryModule.getRecoveryHash(account.target, newOwners, 1, nonce);
      await _safeGuardianApproveHash(safeGuardian, signMessageLib, recoveryHash);
      const data = socialRecoveryModule.interface.encodeFunctionData("multiConfirmRecovery", [
        account.target,
        newOwners,
        1,
        [{ signer: safeGuardian.target, signature: "0x" }],
        false,
      ]);
      await expect(notGuardian.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: Signer not a guardian");
    });
    it("reverts if relayed empty signature belongs to a Safe guardian that did not pre-approve the recovery hash", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const { safeGuardian } = await _deploySafeGuardian(guardian2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, await safeGuardian.getAddress(), 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("multiConfirmRecovery", [
        account.target,
        [newOwner1.address],
        1,
        [{ signer: safeGuardian.target, signature: "0x" }],
        false,
      ]);
      await expect(notGuardian.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: Invalid guardian signature",
      );
    });
    it("reverts if relayed empty signature belongs to a Safe guardian that pre-approved a different recovery hash", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const { safeGuardian, signMessageLib } = await _deploySafeGuardian(guardian2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, await safeGuardian.getAddress(), 1);
      const nonce = await socialRecoveryModule.nonce(account.target);
      const otherHash = await socialRecoveryModule.getRecoveryHash(account.target, [newOwner2.address], 1, nonce);
      await _safeGuardianApproveHash(safeGuardian, signMessageLib, otherHash);
      const data = socialRecoveryModule.interface.encodeFunctionData("multiConfirmRecovery", [
        account.target,
        [newOwner1.address],
        1,
        [{ signer: safeGuardian.target, signature: "0x" }],
        false,
      ]);
      await expect(notGuardian.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: Invalid guardian signature",
      );
    });
    it("allows a relayer to submit an empty signature for a Safe guardian that pre-approved the recovery hash", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const { safeGuardian, signMessageLib } = await _deploySafeGuardian(guardian2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, await safeGuardian.getAddress(), 2);
      const newOwners = [newOwner1.address];
      const nonce = await socialRecoveryModule.nonce(account.target);
      const recoveryHash = await socialRecoveryModule.getRecoveryHash(account.target, newOwners, 1, nonce);
      await _safeGuardianApproveHash(safeGuardian, signMessageLib, recoveryHash);
      const guardian1Signature = await guardian1.signTypedData(
        await getEIP712Domain(socialRecoveryModule),
        getEIP712Types(),
        await getEIP712Message(account, newOwners, 1, nonce),
      );
      const signatures = _sortSignatures([
        { signer: guardian1.address, signature: guardian1Signature },
        { signer: await safeGuardian.getAddress(), signature: "0x" },
      ]);
      const data = socialRecoveryModule.interface.encodeFunctionData("multiConfirmRecovery", [
        account.target,
        newOwners,
        1,
        signatures,
        false,
      ]);
      await notGuardian.sendTransaction({ to: socialRecoveryModule.target, data });
      expect(await socialRecoveryModule.getRecoveryApprovals(account.target, newOwners, 1)).to.eq(2);
      expect(await socialRecoveryModule.hasGuardianApproved(account.target, safeGuardian.target, newOwners, 1)).to.eq(true);
      expect(await socialRecoveryModule.hasGuardianApproved(account.target, guardian1.address, newOwners, 1)).to.eq(true);
    });
    it("reverts if approvals is less than threshold and execute is true", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address, newOwner2.address],
        1,
        [guardian1],
        true,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: confirmed signatures less than threshold",
      );
    });
    it("allows multiple guardians confirms of a recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address],
        1,
        [guardian1, guardian2],
        false,
        false,
        false,
        false,
        undefined,
      );
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      expect(await socialRecoveryModule.getRecoveryApprovals(account.target, [newOwner1.address], 1)).to.eq(2);
    });
    it("allows multiple guardians confirms with sender null signature of a recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address],
        1,
        [guardian1, guardian2],
        false,
        false,
        false,
        false,
        guardian1,
      );
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      expect(await socialRecoveryModule.getRecoveryApprovals(account.target, [newOwner1.address], 1)).to.eq(2);
    });
    it("allows multiple guardians confirms of a recovery and auto-executing", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address],
        1,
        [guardian1, guardian2],
        true,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.emit(
        socialRecoveryModule,
        "RecoveryExecuted",
      );
    });
  });
  describe("Confirm Recovery", async () => {
    it("reverts if sender is not a guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, newOwner2.address],
        1,
        false,
      ]);
      await expect(notGuardian.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: sender not a guardian");
    });
    it("reverts if new owners array is empty", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [account.target, [], 1, false]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: owners cannot be empty");
    });
    it("reverts if new threshold is 0", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, newOwner2.address],
        0,
        false,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new threshold");
    });
    it("reverts if new threshold is > new owners length", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, newOwner2.address],
        3,
        false,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new threshold");
    });
    it("reverts if a new owner is the zero address", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, ADDRESS_ZERO],
        1,
        false,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new owner");
    });
    it("reverts if a new owner is the sentinel address", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, SENTINEL_ADDRESS],
        1,
        false,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new owner");
    });
    it("reverts if a new owner is the wallet itself", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, account.target],
        1,
        false,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new owner");
    });
    it("reverts if a new owner is a guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, guardian2.address],
        1,
        false,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: new owner cannot be guardian",
      );
    });
    it("reverts if new owners contain duplicates", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, newOwner2.address, newOwner1.address],
        1,
        false,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: duplicate new owner");
    });
    it("reverts if approvals are less than threshold", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [
        account.target,
        [newOwner1.address, newOwner2.address],
        1,
        true,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: confirmed signatures less than threshold",
      );
    });
    it("allows guardian recovery confirmation", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [account.target, [newOwner1.address], 1, false]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      expect(await socialRecoveryModule.getRecoveryApprovals(account.target, [newOwner1.address], 1)).to.eq(1);
      expect(await socialRecoveryModule.hasGuardianApproved(account.target, guardian1.address, [newOwner1.address], 1)).to.eq(true);
      expect(await socialRecoveryModule.hasGuardianApproved(account.target, guardian2.address, [newOwner1.address], 1)).to.eq(false);
    });
    it("allows guardian recovery confirmation and executing", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [account.target, [newOwner1.address], 1, true]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.emit(
        socialRecoveryModule,
        "RecoveryExecuted",
      );
    });
    it("encodeRecoverySignableData matches off-chain EIP-712 encoding", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const newOwners = [newOwner1.address, newOwner2.address];
      const newThreshold = 2;
      const nonce = 1n;
      const encodedTypedData = ethers.TypedDataEncoder.encode(
        await getEIP712Domain(socialRecoveryModule),
        getEIP712Types(),
        await getEIP712Message(account, newOwners, newThreshold, nonce),
      );
      expect(await socialRecoveryModule.encodeRecoverySignableData(account.target, newOwners, newThreshold, nonce)).to.eq(encodedTypedData);
      expect(await socialRecoveryModule.getRecoveryHash(account.target, newOwners, newThreshold, nonce)).to.eq(ethers.keccak256(encodedTypedData));
    });
    it("encodeRecoverySignableData returns the EIP-712 signing preimage", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const newOwners = [newOwner1.address, newOwner2.address];
      const newThreshold = 2;
      const nonce = 1n;
      const domainSeparator = ethers.TypedDataEncoder.hashDomain(await getEIP712Domain(socialRecoveryModule));
      const structHash = ethers.TypedDataEncoder.hashStruct(
        "ExecuteRecovery",
        getEIP712Types(),
        await getEIP712Message(account, newOwners, newThreshold, nonce),
      );
      const signableData = await socialRecoveryModule.encodeRecoverySignableData(account.target, newOwners, newThreshold, nonce);
      expect(await socialRecoveryModule.domainSeparator()).to.eq(domainSeparator);
      expect(ethers.dataLength(signableData)).to.eq(66);
      expect(ethers.dataSlice(signableData, 0, 2)).to.eq("0x1901");
      expect(ethers.dataSlice(signableData, 2, 34)).to.eq(domainSeparator);
      expect(ethers.dataSlice(signableData, 34, 66)).to.eq(structHash);
    });
    it("does not expose the former encodeRecoveryData function", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      expect(socialRecoveryModule.interface.hasFunction("encodeRecoveryData")).to.eq(false);
      expect(socialRecoveryModule.interface.hasFunction("encodeRecoverySignableData")).to.eq(true);
      const selector = ethers.id("encodeRecoveryData(address,address[],uint256,uint256)").slice(0, 10);
      const args = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address[]", "uint256", "uint256"],
        [account.target, [newOwner1.address], 1, 0],
      );
      await expect(deployer.call({ to: socialRecoveryModule.target, data: selector + args.slice(2) })).to.be.reverted;
    });
  });
  describe("Execute Recovery", async () => {
    it("reverts if account has no guardians", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: empty guardians");
    });
    it("reverts if recovery doesn't have enough approvals", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      //
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      const data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: confirmed signatures less than threshold",
      );
    });
    it("reverts if new owners are invalid", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [
        account.target,
        [newOwner1.address, ADDRESS_ZERO],
        1,
      ]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: invalid new owner");
    });
    it("reverts if a new owner became a guardian after confirmation", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      await _addGuardianWithThreshold(socialRecoveryModule, account, newOwner1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: new owner cannot be guardian",
      );
      const recoveryRequest = await socialRecoveryModule.getRecoveryRequest(account.target);
      expect(recoveryRequest.executeAfter).to.eq(0);
    });
    it("can not replace existing recovery if new one doesn't have more approvals", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian3.address, 2);
      //
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1, guardian2]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      //
      await confirmRecovery(socialRecoveryModule, account, [newOwner2.address], 1, [guardian1, guardian3]);
      data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner2.address], 1]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: not enough approvals for replacement",
      );
    });
    it("allows execution of a recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      const data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      const recoveryRequest = await socialRecoveryModule.getRecoveryRequest(account.target);
      expect(recoveryRequest.newOwners).to.deep.eq([newOwner1.address]);
      expect(recoveryRequest.newThreshold).to.eq(1);
      expect(recoveryRequest.executeAfter).to.eq((await time.latest()) + 3600);
      expect(recoveryRequest.guardiansApprovalCount).to.eq(1);
    });
    it("allows replacing an existing recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian3.address, 2);
      //
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1, guardian2]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      //
      await confirmRecovery(socialRecoveryModule, account, [newOwner2.address], 1, [guardian1, guardian2, guardian3]);
      data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner2.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      const recoveryRequest = await socialRecoveryModule.getRecoveryRequest(account.target);
      expect(recoveryRequest.newOwners).to.deep.eq([newOwner2.address]);
      expect(recoveryRequest.guardiansApprovalCount).to.eq(3);
    });
    it("stores the nonce the request was executed under", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      const data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      expect((await socialRecoveryModule.getRecoveryRequest(account.target)).nonce).to.eq(0);
      expect(await socialRecoveryModule.nonce(account.target)).to.eq(1);
    });
    it("reports the replaced request nonce when replacing a recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian3.address, 2);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1, guardian2]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await confirmRecovery(socialRecoveryModule, account, [newOwner2.address], 1, [guardian1, guardian2, guardian3]);
      data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner2.address], 1]);
      const tx = await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await expect(tx).to.emit(socialRecoveryModule, "RecoveryCanceled").withArgs(account.target, 0);
      await expect(tx).to.emit(socialRecoveryModule, "RecoveryExecuted").withArgs(account.target, anyValue, 1, 1, anyValue, 3);
      expect((await socialRecoveryModule.getRecoveryRequest(account.target)).nonce).to.eq(1);
    });
  });
  describe("Cancel Recovery", async () => {
    it("invalidates the nonce when there is no ongoing recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery");
      const tx = await account.exec(socialRecoveryModule.target, 0, data);
      await expect(tx).to.emit(socialRecoveryModule, "NonceInvalidated").withArgs(account.target, 0);
      await expect(tx).to.not.emit(socialRecoveryModule, "RecoveryCanceled");
      expect(await socialRecoveryModule.nonce(account.target)).to.eq(1);
    });
    it("allows cancelling an ongoing recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery");
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(socialRecoveryModule, "RecoveryCanceled");
      const recoveryRequest = await socialRecoveryModule.getRecoveryRequest(account.target);
      expect(recoveryRequest.executeAfter).to.eq(0);
    });
    it("reports the executed request nonce when cancelling", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery");
      await expect(account.exec(socialRecoveryModule.target, 0, data))
        .to.emit(socialRecoveryModule, "RecoveryCanceled")
        .withArgs(account.target, 0);
    });
    it("invalidates pending confirmations", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      let data = socialRecoveryModule.interface.encodeFunctionData("confirmRecovery", [account.target, [newOwner1.address], 1, false]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await expect(socialRecoveryModule.executeRecovery.staticCall(account.target, [newOwner1.address], 1)).to.not.be.reverted;
      data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery");
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(socialRecoveryModule, "NonceInvalidated");
      data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: confirmed signatures less than threshold",
      );
    });
  });
  describe("Finalize Recovery", async () => {
    it("reverts if there's no ongoing recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: no ongoing recovery");
    });
    it("reverts if recovery period has not passed yet", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: recovery period still pending");
    });
    it("reverts if plugin was not enabled", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      //
      const removePluginData = account.interface.encodeFunctionData("disableModule", [
        SENTINEL_ADDRESS,
        socialRecoveryModule.target,
      ]);
      await account.exec(account.target, 0, removePluginData);
      //
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS104");
    });
    it("reverts if new owner was later added as a guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await _addGuardianWithThreshold(socialRecoveryModule, account, newOwner1.address, 1);
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: new owner cannot be guardian");
    });
    it("reverts if account removeOwner does not succeed", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await account.setMockModuleExecutionFunction(account.removeOwner.fragment.selector, true);
      //
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: owner removal failed");
    });
    it("reverts if account swapOwner does not succeed", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await account.setMockModuleExecutionFunction(account.swapOwner.fragment.selector, true);
      //
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: owner replacement failed");
    });
    it("reverts if account addOwnerWithThreshold does not succeed", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address, newOwner2.address], 2, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address, newOwner2.address], 2]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await account.setMockModuleExecutionFunction(account.addOwnerWithThreshold.fragment.selector, true);
      //
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: owner addition failed");
    });
    it("reverts if account changeThreshold does not succeed", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address, newOwner2.address], 2, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address, newOwner2.address], 2]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await account.setMockModuleExecutionFunction(account.changeThreshold.fragment.selector, true);
      //
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: change threshold failed");
    });
    it("allows finalizing a recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address, newOwner2.address, newOwner3.address], 2, [
        guardian1,
        guardian2,
      ]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [
        account.target,
        [newOwner1.address, newOwner2.address, newOwner3.address],
        2,
      ]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(socialRecoveryModule, "RecoveryFinalized");
      const newOwners = await account.getOwners();
      expect(newOwners).to.deep.contain(newOwner1.address);
      expect(newOwners).to.deep.contain(newOwner2.address);
      expect(newOwners).to.deep.contain(newOwner3.address);
      expect(await account.getThreshold()).to.eq(2);
      const recoveryRequest = await socialRecoveryModule.getRecoveryRequest(account.target);
      expect(recoveryRequest.executeAfter).to.eq(0);
    });
    it("allows finalizing a recovery with single owner", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [
        account.target,
        [newOwner1.address],
        1,
      ]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(socialRecoveryModule, "RecoveryFinalized");
      const newOwners = await account.getOwners();
      expect(newOwners).to.deep.contain(newOwner1.address);
      expect(await account.getThreshold()).to.eq(1);
      const recoveryRequest = await socialRecoveryModule.getRecoveryRequest(account.target);
      expect(recoveryRequest.executeAfter).to.eq(0);
    });
    it("allows finalizing a recovery if one of the new owners is an old one", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [owner1.address, newOwner2.address, newOwner3.address], 2, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [
        account.target,
        [owner1.address, newOwner2.address, newOwner3.address],
        2,
      ]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(socialRecoveryModule, "RecoveryFinalized");
      const newOwners = await account.getOwners();
      expect(newOwners).to.deep.contain(owner1.address);
      expect(newOwners).to.deep.contain(newOwner2.address);
      expect(newOwners).to.deep.contain(newOwner3.address);
      expect(await account.getThreshold()).to.eq(2);
    });
    it("reports the executed request nonce when finalizing", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data))
        .to.emit(socialRecoveryModule, "RecoveryFinalized")
        .withArgs(account.target, anyValue, 1, 0);
    });
  });
  describe("Recovery Request Validation", async () => {
    it("guardians can still recover after trying to schedule a request naming a guardian as new owner", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian3.address, 3);
      // every guardian approves a request that names guardian1 as the new owner: it is rejected before anything is recorded
      let data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [guardian1.address],
        1,
        [guardian1, guardian2, guardian3],
        true,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith(
        "SM: new owner cannot be guardian",
      );
      expect(await socialRecoveryModule.getRecoveryApprovals(account.target, [guardian1.address], 1)).to.eq(0);
      expect((await socialRecoveryModule.getRecoveryRequest(account.target)).executeAfter).to.eq(0);
      // a corrected request can still be scheduled with the same approval count and finalized
      data = await _getMultiConfirmRecoveryData(
        socialRecoveryModule,
        account,
        [newOwner1.address],
        1,
        [guardian1, guardian2, guardian3],
        true,
        false,
        false,
        false,
        undefined,
      );
      await expect(guardian1.sendTransaction({ to: socialRecoveryModule.target, data })).to.emit(socialRecoveryModule, "RecoveryExecuted");
      await time.increase(3601);
      data = socialRecoveryModule.interface.encodeFunctionData("finalizeRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(socialRecoveryModule, "RecoveryFinalized");
      expect(await account.getOwners()).to.deep.eq([newOwner1.address]);
      expect(await account.getThreshold()).to.eq(1);
    });
  });
  describe("Fallback Handler Forwarding", async () => {
    it("does not let a caller cancel a recovery through the fallback handler", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTestsWithModuleAsFallbackHandler);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery");
      await expect(notGuardian.sendTransaction({ to: account.target, data })).to.be.revertedWith("GS: unexpected calldata length");
      expect((await socialRecoveryModule.getRecoveryRequest(account.target)).executeAfter).to.be.gt(0);
    });
    it("does not let a caller invalidate pending confirmations through the fallback handler", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTestsWithModuleAsFallbackHandler);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      const data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery");
      await expect(notGuardian.sendTransaction({ to: account.target, data })).to.be.revertedWith("GS: unexpected calldata length");
      expect(await socialRecoveryModule.nonce(account.target)).to.eq(0);
      expect(await socialRecoveryModule.getRecoveryApprovals(account.target, [newOwner1.address], 1)).to.eq(1);
    });
    it("still lets the wallet cancel a recovery directly when the module is its fallback handler", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTestsWithModuleAsFallbackHandler);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery");
      await expect(account.exec(socialRecoveryModule.target, 0, data))
        .to.emit(socialRecoveryModule, "RecoveryCanceled")
        .and.to.emit(socialRecoveryModule, "NonceInvalidated");
      expect((await socialRecoveryModule.getRecoveryRequest(account.target)).executeAfter).to.eq(0);
      expect(await socialRecoveryModule.nonce(account.target)).to.eq(2);
    });
  });
});
