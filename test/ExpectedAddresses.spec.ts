import hre from "hardhat";
import { expect } from "chai";
import { isAddress, keccak256 } from "ethers";
import {
  SOCIAL_RECOVERY_MODULE_ADDRESSES,
  SOCIAL_RECOVERY_MODULE_DEPLOYMENTS,
  SOCIAL_RECOVERY_MODULE_VERSION,
  socialRecoveryModuleAddress,
  socialRecoveryModuleCodeHash,
} from "../rocketh/expected_addresses.js";

// Recomputes the pinned deployment data of the version this repository builds, so that a change
// that moves an address (sources, line endings, compiler settings, dependencies) has to update the
// pin in the same change. The deploy script performs the address check before sending any
// transaction.
describe("Expected deployment addresses", () => {
  it("lists well-formed, distinct variants for every version", () => {
    for (const [version, variants] of Object.entries(SOCIAL_RECOVERY_MODULE_DEPLOYMENTS)) {
      expect(variants, version).to.not.be.empty;
      const periods = new Set(variants.map((entry) => entry.recoveryPeriod));
      expect(periods.size, `${version}: duplicate recovery period`).to.equal(variants.length);
      for (const { label, recoveryPeriod, address, codeHash } of variants) {
        expect(recoveryPeriod, `${version} ${label}`).to.be.greaterThan(0n);
        expect(isAddress(address), `${version} ${label}: address`).to.be.true;
        expect(codeHash, `${version} ${label}: code hash`).to.match(/^0x[0-9a-f]{64}$/);
      }
    }
  });

  it("builds the pinned version", async () => {
    const { ethers } = await hre.network.create();
    const module = await (await ethers.getContractFactory("SocialRecoveryModule")).deploy(1n);
    expect(await module.VERSION()).to.equal(SOCIAL_RECOVERY_MODULE_VERSION);
  });

  it("pins the address and code hash the build gives each recovery period", async () => {
    const artifact = await hre.artifacts.readArtifact("SocialRecoveryModule");
    for (const { label, recoveryPeriod, address, codeHash } of SOCIAL_RECOVERY_MODULE_ADDRESSES) {
      expect(socialRecoveryModuleAddress(artifact.bytecode, recoveryPeriod), `${label}: address`).to.equal(address);
      expect(socialRecoveryModuleCodeHash(artifact, recoveryPeriod), `${label}: code hash`).to.equal(codeHash);
    }
  });

  it("pins the code hash of a deployed instance", async () => {
    const { ethers } = await hre.network.create();
    const factory = await ethers.getContractFactory("SocialRecoveryModule");
    for (const { label, recoveryPeriod, codeHash } of SOCIAL_RECOVERY_MODULE_ADDRESSES) {
      const module = await factory.deploy(recoveryPeriod);
      await module.waitForDeployment();
      expect(keccak256(await ethers.provider.getCode(await module.getAddress())), label).to.equal(codeHash);
    }
  });
});
