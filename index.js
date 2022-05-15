const core = require("@actions/core");
const github = require("@actions/github");
const { getAccount } = require("@solana/spl-token");
const { Connection, PublicKey } = require("@solana/web3.js");
const BN = require("bn.js");

async function run() {
  try {
    const programId = core.getInput("program-id");
    const githubRepository = core.getInput("github-repository");
    const rpcEndpoint = core.getInput("rpc-endpoint");
    const token = core.getInput("token");

    const [owner, repoName] = githubRepository.split("/");
    const connection = new Connection(rpcEndpoint);
    const octokit = github.getOctokit(token);

    const { data: repository } = await octokit.rest.repos.get({
      repo: repoName,
      owner,
    });

    const [boardPublicKey] = await PublicKey.findProgramAddress(
      [
        Buffer.from("board", "utf8"),
        new BN(repository.id).toArrayLike(Buffer, "le", 4),
      ],
      new PublicKey(programId)
    );

    // get all issues with a bounty enabled
    const { data: issuesForRepo } = await octokit.rest.issues.listForRepo({
      repo: repoName,
      owner,
      labels: "drill:bounty:closed",
      state: "closed",
    });
  
    issuesForRepo.forEach(async (issue) => {
      // find bounty enabled comment
      const [bountyPublicKey] = await PublicKey.findProgramAddress(
        [
          Buffer.from("bounty", "utf8"),
          boardPublicKey.toBuffer(),
          new BN(issue.number).toArrayLike(Buffer, "le", 4),
        ],
        new PublicKey(programId)
      );
      const [bountyVaultPublicKey] = await PublicKey.findProgramAddress(
        [Buffer.from("bounty_vault", "utf8"), bountyPublicKey.toBuffer()],
        new PublicKey(programId)
      );

      let account;
      let error;

      try {
        account = await getAccount(
          connection,
          bountyVaultPublicKey
        );
      } catch(err) {
        error = err;
      }

      if (error !== undefined) {
        await octokit.rest.issues.removeLabel({
          owner,
          repo: repoName,
          name: 'drill:bounty:closed'
        });
      }
    });

    core.setOutput("result", true);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
