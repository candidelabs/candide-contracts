import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import hre, { ethers } from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { SocialRecoveryModule, TestExecutor } from "../typechain-types";
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
      [await guardianStorage.getAddress(), 3600],
      { signer: deployer },
    );
    const account = await hre.ethers.deployContract("TestExecutor", [], { signer: deployer });
    await account.testSetup([owner1.address, owner2.address], 1, ADDRESS_ZERO, [await socialRecoveryModule.getAddress()]);
    //
    return { account, socialRecoveryModule, guardianStorage };
  }

  async function _addGuardianWithThreshold(
    socialRecoveryModule: SocialRecoveryModule,
    account: TestExecutor,
    guardian: string,
    threshold: number,
  ) {
    const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [account.target, guardian, threshold]);
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
    it("reverts if empty signature is not transaction sender", async () => {
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
        "SM: null signature should have the signer as the sender",
      );
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
    it("encodeRecoveryData matches off-chain EIP-712 encoding", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const newOwners = [newOwner1.address, newOwner2.address];
      const newThreshold = 2;
      const nonce = 1n;
      const encodedTypedData = ethers.TypedDataEncoder.encode(
        await getEIP712Domain(socialRecoveryModule),
        getEIP712Types(),
        await getEIP712Message(account, newOwners, newThreshold, nonce),
      );
      expect(await socialRecoveryModule.encodeRecoveryData(account.target, newOwners, newThreshold, nonce)).to.eq(encodedTypedData);
      expect(await socialRecoveryModule.getRecoveryHash(account.target, newOwners, newThreshold, nonce)).to.eq(ethers.keccak256(encodedTypedData));
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
  });
  describe("Cancel Recovery", async () => {
    it("reverts if not authorized", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery", [account.target]);
      await expect(deployer.sendTransaction({ to: socialRecoveryModule.target, data })).to.be.revertedWith("SM: unauthorized");
    });
    it("reverts if there's no ongoing recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("SM: no ongoing recovery");
    });
    it("allows cancelling an ongoing recovery", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await confirmRecovery(socialRecoveryModule, account, [newOwner1.address], 1, [guardian1]);
      let data = socialRecoveryModule.interface.encodeFunctionData("executeRecovery", [account.target, [newOwner1.address], 1]);
      await guardian1.sendTransaction({ to: socialRecoveryModule.target, data });
      data = socialRecoveryModule.interface.encodeFunctionData("cancelRecovery", [account.target]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(socialRecoveryModule, "RecoveryCanceled");
      const recoveryRequest = await socialRecoveryModule.getRecoveryRequest(account.target);
      expect(recoveryRequest.executeAfter).to.eq(0);
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
  });
});
