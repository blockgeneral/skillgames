import "@stdlib/deploy";

message Withdraw {
    recipient: Address;
    amount: Int as coins;
}

message CollectFees {}

contract SkillGamezVault with Deployable {
    owner: Address;
    accumulatedFees: Int as coins;

    const MIN_DEPOSIT: Int = ton("0.1");
    const GAS_RESERVE: Int = ton("0.05");
    const FEE_PERCENT: Int = 10;

    init(owner: Address) {
        self.owner = owner;
        self.accumulatedFees = 0;
    }

    // Deposit: accept any incoming TON above minimum
    receive() {
        let ctx: Context = context();
        require(ctx.value >= self.MIN_DEPOSIT, "Deposit below minimum 0.1 TON");
    }

    // Withdraw: owner sends payout to recipient, retains fee
    receive(msg: Withdraw) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Only owner can withdraw");
        require(msg.amount > 0, "Amount must be positive");

        let fee: Int = msg.amount * self.FEE_PERCENT / 100;
        let payout: Int = msg.amount - fee;

        require(myBalance() >= payout + self.GAS_RESERVE, "Insufficient contract balance");

        self.accumulatedFees = self.accumulatedFees + fee;

        send(SendParameters{
            to: msg.recipient,
            value: payout,
            mode: SendPayGasSeparately,
            body: "SkillGamez payout".asComment()
        });
    }

    // CollectFees: owner withdraws accumulated platform fees
    receive(msg: CollectFees) {
        let ctx: Context = context();
        require(ctx.sender == self.owner, "Only owner can collect fees");
        require(self.accumulatedFees > 0, "No fees to collect");

        let fees: Int = self.accumulatedFees;
        self.accumulatedFees = 0;

        send(SendParameters{
            to: self.owner,
            value: fees,
            mode: SendPayGasSeparately,
            body: "SkillGamez fees".asComment()
        });
    }

    get fun balance(): Int {
        return myBalance();
    }

    get fun accumulatedFees(): Int {
        return self.accumulatedFees;
    }

    get fun owner(): Address {
        return self.owner;
    }
}
