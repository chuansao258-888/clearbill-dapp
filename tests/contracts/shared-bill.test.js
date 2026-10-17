const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("SharedBill", function () {
  let contract, payee, a, b, c, stranger;
  const one = ethers.parseEther("0.001");
  const two = ethers.parseEther("0.002");

  /** Deploys a fresh shared ledger with five independent wallets. */
  beforeEach(async function () {
    [payee, a, b, c, stranger] = await ethers.getSigners();
    contract = await ethers.deployContract("SharedBill");
    await contract.waitForDeployment();
  });

  /** Creates a shared bill with a fresh idempotency reference. */
  async function create(options = {}) {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const count = options.count ?? 2;
    const stages = options.stages ?? 2;
    const payers = options.payers ?? [a.address, b.address, count === 3 ? c.address : ethers.ZeroAddress];
    const amounts = options.amounts ?? [[one, stages === 2 ? two : 0n], [two, stages === 2 ? one : 0n], count === 3 ? [one, stages === 2 ? one : 0n] : [0n, 0n]];
    const due = [now + 3600, stages === 2 ? now + 7200 : 0];
    const reference = ethers.hexlify(ethers.randomBytes(32));
    await contract.connect(payee).createSharedBill(payers, "Team equipment", count, stages, amounts, due, reference);
    return { id: (await contract.nextBillId()) - 1n, payers, amounts, due, reference };
  }

  it("stores fixed payer shares and indexes the payee and each payer", async function () {
    const { id, reference, due } = await create();
    const bill = await contract.getBill(id);
    expect(bill.payee).to.equal(payee.address);
    expect(bill.payerCount).to.equal(2n);
    expect(bill.installmentCount).to.equal(2n);
    expect(bill.totalAmount).to.equal(one + two + two + one);
    expect(await contract.getBillIdByReference(payee.address, reference)).to.equal(id);
    expect(await contract.getAccountBillCount(payee.address, true)).to.equal(1n);
    expect(await contract.getAccountBillCount(a.address, false)).to.equal(1n);
    expect((await contract.getAccountBillIds(b.address, false, 0, 50)).ids).to.deep.equal([id]);
    expect((await contract.getPaymentQuote(id, a.address)).amount).to.equal(one);
    expect((await contract.getPaymentQuote(id, a.address)).dueAt).to.equal(BigInt(due[0]));
    await expect(contract.getBill(0)).to.be.revertedWithCustomError(contract, "BillNotFound");
    await expect(contract.getAccountBillIds(a.address, false, 2, 50)).to.be.revertedWithCustomError(contract, "InvalidPagination");
  });

  it("rejects duplicate payers, malformed shares, invalid schedules and duplicate references", async function () {
    const { payers, amounts, due, reference, id } = await create();
    const call = (people, count, stages, shares, dates, ref = ethers.hexlify(ethers.randomBytes(32))) =>
      contract.connect(payee).createSharedBill(people, "x", count, stages, shares, dates, ref);
    await expect(call([a.address, a.address, ethers.ZeroAddress], 2, 2, amounts, due)).to.be.revertedWithCustomError(contract, "InvalidTerms");
    await expect(call([payee.address, b.address, ethers.ZeroAddress], 2, 2, amounts, due)).to.be.revertedWithCustomError(contract, "InvalidTerms");
    await expect(call(payers, 2, 2, [[0n, two], [two, one], [0n, 0n]], due)).to.be.revertedWithCustomError(contract, "InvalidTerms");
    await expect(call(payers, 2, 1, amounts, [due[0], 0])).to.be.revertedWithCustomError(contract, "InvalidTerms");
    await expect(call(payers, 2, 2, amounts, [due[0], due[0]])).to.be.revertedWithCustomError(contract, "InvalidTerms");
    await expect(call([a.address, b.address, c.address], 2, 2, [[one, two], [two, one], [one, one]], due)).to.be.revertedWithCustomError(contract, "InvalidTerms");
    await expect(call(payers, 2, 2, amounts, due, reference)).to.be.revertedWithCustomError(contract, "DuplicateReference").withArgs(id);
  });

  it("enforces each payer's exact sequence and forwards payments immediately", async function () {
    const { id } = await create();
    await expect(contract.connect(stranger).payInstallment(id, 0, { value: one })).to.be.revertedWithCustomError(contract, "Unauthorized");
    await expect(contract.connect(a).payInstallment(id, 1, { value: two })).to.be.revertedWithCustomError(contract, "UnexpectedInstallment");
    await expect(contract.connect(a).payInstallment(id, 0, { value: one - 1n })).to.be.revertedWithCustomError(contract, "IncorrectValue");
    const before = await ethers.provider.getBalance(payee.address);
    await contract.connect(a).payInstallment(id, 0, { value: one });
    expect(await ethers.provider.getBalance(payee.address)).to.equal(before + one);
    expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(0n);
    await expect(contract.connect(a).payInstallment(id, 0, { value: one })).to.be.revertedWithCustomError(contract, "UnexpectedInstallment");
    await contract.connect(b).payInstallment(id, 0, { value: two });
    await contract.connect(b).payInstallment(id, 1, { value: one });
    expect((await contract.getBill(id)).status).to.equal(1n);
    await contract.connect(a).payInstallment(id, 1, { value: two });
    expect((await contract.getBill(id)).status).to.equal(2n);
    await expect(contract.connect(a).payInstallment(id, 1, { value: two })).to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("supports three payers and allows an overdue installment", async function () {
    const { id, due } = await create({ count: 3, stages: 1 });
    await network.provider.send("evm_setNextBlockTimestamp", [due[0] + 1]);
    await network.provider.send("evm_mine");
    expect((await contract.getPaymentQuote(id, c.address)).overdue).to.equal(true);
    await contract.connect(c).payInstallment(id, 0, { value: one });
    expect((await contract.getBill(id)).paidAmount).to.equal(one);
  });

  it("cancels only a completely unpaid bill", async function () {
    const { id } = await create();
    await expect(contract.connect(a).cancelBill(id)).to.be.revertedWithCustomError(contract, "Unauthorized");
    await contract.connect(payee).cancelBill(id);
    expect((await contract.getBill(id)).status).to.equal(3n);
    await expect(contract.connect(a).payInstallment(id, 0, { value: one })).to.be.revertedWithCustomError(contract, "InvalidStatus");
    const second = await create();
    await contract.connect(a).payInstallment(second.id, 0, { value: one });
    await expect(contract.connect(payee).cancelBill(second.id)).to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("funds an exact atomic refund to every payer who has paid", async function () {
    const { id } = await create();
    await contract.connect(a).payInstallment(id, 0, { value: one });
    await contract.connect(b).payInstallment(id, 0, { value: two });
    await contract.connect(a).payInstallment(id, 1, { value: two });
    const total = one + two + two;
    await expect(contract.connect(a).refundBill(id, total, { value: total })).to.be.revertedWithCustomError(contract, "Unauthorized");
    await expect(contract.connect(payee).refundBill(id, one, { value: total })).to.be.revertedWithCustomError(contract, "StalePaidAmount");
    await expect(contract.connect(payee).refundBill(id, total, { value: total - 1n })).to.be.revertedWithCustomError(contract, "IncorrectValue");
    const beforeA = await ethers.provider.getBalance(a.address);
    const beforeB = await ethers.provider.getBalance(b.address);
    await expect(contract.connect(payee).refundBill(id, total, { value: total }))
      .to.emit(contract, "SharedPayerRefunded").withArgs(id, payee.address, a.address, one + two)
      .and.to.emit(contract, "SharedPayerRefunded").withArgs(id, payee.address, b.address, two);
    expect(await ethers.provider.getBalance(a.address)).to.equal(beforeA + one + two);
    expect(await ethers.provider.getBalance(b.address)).to.equal(beforeB + two);
    expect((await contract.getBill(id)).status).to.equal(4n);
    expect(await ethers.provider.getBalance(await contract.getAddress())).to.equal(0n);
    await expect(contract.connect(payee).refundBill(id, total, { value: total })).to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("rolls back a rejected installment and a rejected multi-payer refund", async function () {
    const rejectingPayee = await ethers.deployContract("RejectingSharedPayee");
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    await rejectingPayee.create(contract, a.address, b.address, now + 3600, ethers.hexlify(ethers.randomBytes(32)));
    await expect(contract.connect(a).payInstallment(1, 0, { value: 1n })).to.be.revertedWithCustomError(contract, "TransferFailed");
    expect((await contract.getBill(1)).paidAmount).to.equal(0n);
    const rejectingPayer = await ethers.deployContract("RejectingSharedPayer");
    const second = await create({ stages: 1, payers: [a.address, await rejectingPayer.getAddress(), ethers.ZeroAddress] });
    await contract.connect(a).payInstallment(second.id, 0, { value: one });
    await rejectingPayer.pay(contract, second.id, 0, { value: two });
    await expect(contract.connect(payee).refundBill(second.id, one + two, { value: one + two })).to.be.revertedWithCustomError(contract, "TransferFailed");
    expect((await contract.getBill(second.id)).refundedAmount).to.equal(0n);
    expect((await contract.getBill(second.id)).status).to.equal(2n);
  });

  it("blocks a nested refund from the payee's receive callback", async function () {
    const reentering = await ethers.deployContract("ReenteringSharedPayee");
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    await reentering.create(contract, a.address, b.address, now + 3600, ethers.hexlify(ethers.randomBytes(32)));
    await contract.connect(a).payInstallment(1, 0, { value: 1n });
    expect(await reentering.reentered()).to.equal(false);
    expect((await contract.getBill(1)).status).to.equal(1n);
    expect((await contract.getBill(1)).paidAmount).to.equal(1n);
  });
});
