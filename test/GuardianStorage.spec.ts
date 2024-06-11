import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import hre, { ethers } from "hardhat";
import { SocialRecoveryModule, TestExecutor } from "../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

describe("GuardianStorage", async () => {
  let deployer: SignerWithAddress, owner1: SignerWithAddress, owner2: SignerWithAddress;
  let guardian1: SignerWithAddress, guardian2: SignerWithAddress, guardian3: SignerWithAddress, notGuardian: SignerWithAddress;

  const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
  const SENTINEL_ADDRESS = "0x0000000000000000000000000000000000000001";

  before(async () => {
    [deployer, owner1, owner2, guardian1, guardian2, guardian3, notGuardian] =
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
    return { account, socialRecoveryModule, guardianStorage: socialRecoveryModule };
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


  describe("Adding Guardians", async () => {
    it("should not allow adding guardian if SocialRecoveryModule is not an enabled module", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const removeModuleData = account.interface.encodeFunctionData("disableModule", [
        SENTINEL_ADDRESS,
        socialRecoveryModule.target,
      ]);
      await account.exec(account.target, 0, removeModuleData);
      //
      const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian1.address, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: method only callable when module is enabled");
    });
    it("should not allow adding zero address as guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [ADDRESS_ZERO, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid guardian");
    });
    it("should not allow adding sentinel address as guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [SENTINEL_ADDRESS, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid guardian");
    });
    it("should not allow adding itself (wallet) as guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [account.target, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid guardian");
    });
    it("should not allow adding the wallet owners as guardians", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [owner1.address, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: guardian cannot be an owner");
    });
    it("should not allow adding guardian with 0 threshold", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian1.address, 0]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: threshold cannot be 0");
    });
    it("should not allow adding x guardians with threshold >x", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian1.address, 2]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith(
        "GS: threshold must be lower or equal to guardians count",
      );
    });
    it("should not allow adding duplicate guardians", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      let data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian1.address, 1]);
      await account.exec(socialRecoveryModule.target, 0, data);
      data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian1.address, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: duplicate guardian");
    });
    it("should allow adding guardians with new threshold", async () => {
      const { account, socialRecoveryModule, guardianStorage } = await loadFixture(setupTests);
      expect(await socialRecoveryModule.isGuardian(account.target, guardian1.address)).to.eq(false);
      expect(await socialRecoveryModule.getGuardians(account.target)).to.deep.eq([]);
      let data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian1.address, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "GuardianAdded").and.to.emit(guardianStorage, "ChangedThreshold");
      expect(await socialRecoveryModule.isGuardian(account.target, guardian1.address)).to.eq(true);
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(1);
      expect(await socialRecoveryModule.guardiansCount(account.target)).to.eq(1);
      data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian2.address, 2]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "GuardianAdded").and.to.emit(guardianStorage, "ChangedThreshold");
      expect(await socialRecoveryModule.isGuardian(account.target, guardian1.address)).to.eq(true);
      expect(await socialRecoveryModule.isGuardian(account.target, guardian2.address)).to.eq(true);
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(2);
      expect(await socialRecoveryModule.guardiansCount(account.target)).to.eq(2);
    });
    it("should allow adding guardians with same threshold", async () => {
      const { account, socialRecoveryModule, guardianStorage } = await loadFixture(setupTests);
      let data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian1.address, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "GuardianAdded").and.to.emit(guardianStorage, "ChangedThreshold");
      data = socialRecoveryModule.interface.encodeFunctionData("addGuardianWithThreshold", [guardian2.address, 1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "GuardianAdded").and.to.not.emit(guardianStorage, "ChangedThreshold");
      expect(await socialRecoveryModule.isGuardian(account.target, guardian1.address)).to.eq(true);
      expect(await socialRecoveryModule.isGuardian(account.target, guardian2.address)).to.eq(true);
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(1);
      expect(await socialRecoveryModule.guardiansCount(account.target)).to.eq(2);
    });
  });
  describe("Revoking Guardians", async () => {
    it("should not allow revoking guardian if SocialRecoveryModule is not an enabled module", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const removeModuleData = account.interface.encodeFunctionData("disableModule", [
        SENTINEL_ADDRESS,
        socialRecoveryModule.target,
      ]);
      await account.exec(account.target, 0, removeModuleData);
      //
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [SENTINEL_ADDRESS, guardian1.address, 0]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: method only callable when module is enabled");
    });
    it("can not revoke non guardians", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        SENTINEL_ADDRESS,
        guardian1.address,
        0,
      ]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid previous guardian");
    });
    it("can not revoke address 0", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      //
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        SENTINEL_ADDRESS,
        ADDRESS_ZERO,
        0,
      ]);
      //
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid guardian");
    });
    it("can not revoke sentinel address", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      //
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        SENTINEL_ADDRESS,
        SENTINEL_ADDRESS,
        0,
      ]);
      //
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid guardian");
    });
    it("can not revoke with an invalid threshold", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        SENTINEL_ADDRESS,
        guardian1.address,
        1,
      ]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid threshold");
    });
    it("can not revoke with a 0 threshold", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        SENTINEL_ADDRESS,
        guardian2.address,
        0,
      ]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: threshold cannot be 0");
    });
    it("revocation reverts if wrong previous guardian", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        owner1.address,
        guardian1.address,
        0,
      ]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: invalid previous guardian");
    });
    it("should allow revoking guardians with same threshold", async () => {
      const { account, socialRecoveryModule, guardianStorage } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 1);
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        guardian2.address,
        guardian1.address,
        1,
      ]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "GuardianRevoked").and.to.not.emit(guardianStorage, "ChangedThreshold");
      expect(await socialRecoveryModule.isGuardian(account.target, guardian1.address)).to.eq(false);
      expect(await socialRecoveryModule.isGuardian(account.target, guardian2.address)).to.eq(true);
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(1);
    });
    it("should allow revoking guardians with new threshold", async () => {
      const { account, socialRecoveryModule, guardianStorage } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const data = socialRecoveryModule.interface.encodeFunctionData("revokeGuardianWithThreshold", [
        guardian2.address,
        guardian1.address,
        1,
      ]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "GuardianRevoked").and.to.emit(guardianStorage, "ChangedThreshold");
      expect(await socialRecoveryModule.isGuardian(account.target, guardian1.address)).to.eq(false);
      expect(await socialRecoveryModule.isGuardian(account.target, guardian2.address)).to.eq(true);
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(1);
    });
  });
  describe("Changing Threshold", async () => {
    it("should not allow changing threshold if SocialRecoveryModule is not an enabled module", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      const removeModuleData = account.interface.encodeFunctionData("disableModule", [
        SENTINEL_ADDRESS,
        socialRecoveryModule.target,
      ]);
      await account.exec(account.target, 0, removeModuleData);
      //
      const data = socialRecoveryModule.interface.encodeFunctionData("changeThreshold", [1]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: method only callable when module is enabled");
    });
    it("reverts if threshold is higher than guardians count", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian3.address, 2);
      const data = socialRecoveryModule.interface.encodeFunctionData("changeThreshold", [4]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith(
        "GS: threshold must be lower or equal to guardians count",
      );
    });
    it("reverts if threshold is equal to 0", async () => {
      const { account, socialRecoveryModule } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 2);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian3.address, 2);
      const data = socialRecoveryModule.interface.encodeFunctionData("changeThreshold", [0]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.be.revertedWith("GS: threshold cannot be 0");
    });
    it("allows changing threshold to 0 even with no guardians", async () => {
      const { account, socialRecoveryModule, guardianStorage } = await loadFixture(setupTests);
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(0);
      const data = socialRecoveryModule.interface.encodeFunctionData("changeThreshold", [0]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "ChangedThreshold");
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(0);
    });
    it("allows changing threshold", async () => {
      const { account, socialRecoveryModule, guardianStorage } = await loadFixture(setupTests);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian1.address, 1);
      await _addGuardianWithThreshold(socialRecoveryModule, account, guardian2.address, 1);
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(1);
      const data = socialRecoveryModule.interface.encodeFunctionData("changeThreshold", [2]);
      await expect(account.exec(socialRecoveryModule.target, 0, data)).to.emit(guardianStorage, "ChangedThreshold");
      expect(await socialRecoveryModule.threshold(account.target)).to.eq(2);
    });
  });
});