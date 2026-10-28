import type { HardhatRuntimeEnvironment } from "hardhat/types/hre";

interface CodesizeTaskArguments {
    skipcompile: boolean;
    contractname?: string;
}

export default async function (taskArgs: CodesizeTaskArguments, hre: HardhatRuntimeEnvironment) {
    if (!taskArgs.skipcompile) {
        await hre.tasks.getTask("build").run({ quiet: true });
    }
    const contracts = await hre.artifacts.getAllFullyQualifiedNames();
    for (const contract of contracts) {
        const artifact = await hre.artifacts.readArtifact(contract);
        if (taskArgs.contractname && taskArgs.contractname !== artifact.contractName) continue;
        console.log(artifact.contractName, Math.max(0, (artifact.deployedBytecode.length - 2) / 2), "bytes (limit is 24576)");
    }
}
