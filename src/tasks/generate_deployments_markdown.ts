// hardhat.config.js
import "hardhat-deploy";
import fs from "fs";
import path from 'path';
import { task } from "hardhat/config";
import {NETWORK_ID_URL_MAPPING} from "../utils/etherscan_urls";

task("generate:deployments", "Generate markdown file with deployed contract addresses")
  .setAction(async () => {
    if (!fs.existsSync(path.join(__dirname, "../../deployments.ts"))) {
      console.error("No deployments file found. Please run the deployment script first.");
      return;
    }
    
    const {default: deployments} = await import("../../deployments");
    const markdownFile = "./docs/deployments.md";

    const networks = Object.keys(deployments);

    if (networks.length === 0) {
      console.error("No deployments found in the deployments file.");
      return;
    }


    let markdownContent = "# Deployed Contracts\n\n";

    networks.forEach((network) => {
      if (deployments[network]) {
        const contracts = deployments[network][0];

        markdownContent += `## Network: ${contracts.name}\n\n`;
        markdownContent += "| Contract Name | Address (click to view on Etherscan) |\n";
        markdownContent += "| -------------- | -------------------------------- |\n";

        Object.keys(contracts.contracts).forEach((contractName) => {
          const contractAddress = contracts.contracts[contractName].address;
          const etherscanUrl = `${NETWORK_ID_URL_MAPPING[network]}/address/${contractAddress}`;
          markdownContent += `| ${contractName} | <a href="${etherscanUrl}" target="_blank">${contractAddress}</a> |\n`;

        });

        markdownContent += "\n";
      }
    });

    fs.writeFileSync(markdownFile, markdownContent);

    console.log(`Markdown file with deployed contract addresses generated: ${markdownFile}`);
  });
