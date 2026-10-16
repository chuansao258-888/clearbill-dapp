const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("ClearBill", function () {
  let contract, payee, payer, stranger;
  const one = ethers.parseEther("0.01");
  const two = ethers.parseEther("0.02");

  /** Deploys a fresh business contract and distinct test wallets. */
  beforeEach(async function () {
    [payee, payer, stranger] = await ethers.getSigners();
    contract = await ethers.deployContract("ClearBill");
    await contract.waitForDeployment();
  });

  /** Creates a bill with a fresh reference and future deadlines. */
  async function create(count = 1, amounts = [one, 0n], payerAddress = payer.address) {
    const block = await ethers.provider.getBlock("latest");
    const due = [block.timestamp + 3600, count === 2 ? block.timestamp + 7200 : 0];
    const reference = ethers.hexlify(ethers.randomBytes(32));
    await contract.connect(payee).createBill(payerAddress, "Website work", count, amounts, due, reference);
    return { id: (await contract.nextBillId()) - 1n, due, reference };
  }

  it("creates immutable single-payment terms and account indexes", async function () {
    const { id, reference } = await create();
    const bill = await contract.getBill(id);
    expect(bill.payee).to.equal(payee.address);
    expect(bill.payer).to.equal(payer.address);
    expect(bill.amounts[0]).to.equal(one);
    expect(bill.installmentCount).to.equal(1n);
    expect(await contract.getBillIdByReference(payee.address, reference)).to.equal(id);
    expect(await contract.getAccountBillCount(payee.address, true)).to.equal(1n);
    expect(await contract.getAccountBillCount(payer.address, false)).to.equal(1n);
    expect((await contract.getAccountBillIds(payee.address, true, 0, 50)).ids).to.deep.equal([id]);
    await expect(contract.connect(payee).createBill(payer.address, "Website work", 1, [one, 0], [1, 0], reference))
      .to.be.revertedWithCustomError(contract, "InvalidSchedule");
  });

  it("rejects invalid creation terms and duplicate references", async function () {
    const { due, reference, id } = await create();
    await expect(contract.createBill(payee.address, "a", 1, [one, 0], [due[0], 0], reference))
      .to.be.revertedWithCustomError(contract, "InvalidAddress");
    await expect(contract.createBill(payer.address, "", 1, [one, 0], [due[0], 0], reference))
      .to.be.revertedWithCustomError(contract, "InvalidLabelLength");
    await expect(contract.createBill(payer.address, "a", 3, [one, 0], [due[0], 0], reference))
      .to.be.revertedWithCustomError(contract, "InvalidInstallmentCount");
    await expect(contract.createBill(payer.address, "a", 1, [0, 0], [due[0], 0], reference))
      .to.be.revertedWithCustomError(contract, "InvalidAmount");
    await expect(contract.createBill(payer.address, "a", 2, [one, two], [due[0], due[0]], reference))
      .to.be.revertedWithCustomError(contract, "InvalidSchedule");
    await expect(contract.createBill(payer.address, "a", 1, [one, 0], [due[0], 0], reference))
      .to.be.revertedWithCustomError(contract, "DuplicateReference").withArgs(id);
    expect(await contract.nextBillId()).to.equal(2n);
  });

  it("forwards a single payment and blocks unauthorized, inaccurate and repeated calls", async function () {
    const { id } = await create();
    await expect(contract.connect(stranger).payInstallment(id, 0, { value: one }))
      .to.be.revertedWithCustomError(contract, "Unauthorized");
    await expect(contract.connect(payer).payInstallment(id, 0, { value: one - 1n }))
      .to.be.revertedWithCustomError(contract, "IncorrectValue");
    const before = await ethers.provider.getBalance(payee.address);
    await expect(contract.connect(payer).payInstallment(id, 0, { value: one }))
      .to.emit(contract, "InstallmentPaid").withArgs(id, payee.address, payer.address, 0, one, one);
    expect(await ethers.provider.getBalance(payee.address)).to.equal(before + one);
    expect((await contract.getBill(id)).status).to.equal(2n);
    await expect(contract.connect(payer).payInstallment(id, 0, { value: one }))
      .to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("requires the stated installment index even when both amounts match", async function () {
    const { id } = await create(2, [one, one]);
    await expect(contract.connect(payer).payInstallment(id, 1, { value: one }))
      .to.be.revertedWithCustomError(contract, "UnexpectedInstallment");
    await contract.connect(payer).payInstallment(id, 0, { value: one });
    await expect(contract.connect(payer).payInstallment(id, 0, { value: one }))
      .to.be.revertedWithCustomError(contract, "UnexpectedInstallment");
    expect((await contract.getBill(id)).paidAmount).to.equal(one);
    await contract.connect(payer).payInstallment(id, 1, { value: one });
    expect((await contract.getBill(id)).status).to.equal(2n);
  });

  it("allows late payment and derives overdue from the next unpaid deadline", async function () {
    const { id, due } = await create(2, [one, two]);
    await network.provider.send("evm_setNextBlockTimestamp", [due[0] + 1]);
    await network.provider.send("evm_mine");
    expect((await contract.getPaymentQuote(id)).overdue).to.equal(true);
    await contract.connect(payer).payInstallment(id, 0, { value: one });
    expect((await contract.getPaymentQuote(id)).overdue).to.equal(false);
    await network.provider.send("evm_setNextBlockTimestamp", [due[1] + 1]);
    await network.provider.send("evm_mine");
    await contract.connect(payer).payInstallment(id, 1, { value: two });
    expect((await contract.getPaymentQuote(id)).payableNow).to.equal(false);
  });

  it("cancels only an unpaid bill and preserves its history", async function () {
    const { id } = await create();
    await expect(contract.connect(payer).cancelBill(id)).to.be.revertedWithCustomError(contract, "Unauthorized");
    await contract.connect(payee).cancelBill(id);
    expect((await contract.getBill(id)).status).to.equal(3n);
    await expect(contract.connect(payer).payInstallment(id, 0, { value: one })).to.be.revertedWithCustomError(contract, "InvalidStatus");
    await expect(contract.connect(payee).cancelBill(id)).to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("refunds exactly the received principal and closes an unpaid balance", async function () {
    const { id } = await create(2, [one, two]);
    await contract.connect(payer).payInstallment(id, 0, { value: one });
    await expect(contract.connect(payee).refundBill(id, one, { value: one - 1n })).to.be.revertedWithCustomError(contract, "IncorrectValue");
    await expect(contract.connect(payee).refundBill(id, two, { value: two })).to.be.revertedWithCustomError(contract, "StalePaidAmount");
    await expect(contract.connect(payer).refundBill(id, one, { value: one })).to.be.revertedWithCustomError(contract, "Unauthorized");
    const before = await ethers.provider.getBalance(payer.address);
    await contract.connect(payee).refundBill(id, one, { value: one });
    expect(await ethers.provider.getBalance(payer.address)).to.equal(before + one);
    const bill = await contract.getBill(id);
    expect(bill.status).to.equal(4n);
    expect(bill.paidAmount).to.equal(one);
    expect(bill.refundedAmount).to.equal(one);
    await expect(contract.connect(payer).payInstallment(id, 1, { value: two })).to.be.revertedWithCustomError(contract, "InvalidStatus");
  });

  it("rejects direct transfers and unknown bills", async function () {
    await expect(payee.sendTransaction({ to: await contract.getAddress(), value: one })).to.be.revertedWithCustomError(contract, "DirectTransferNotAllowed");
    await expect(contract.getBill(99)).to.be.revertedWithCustomError(contract, "BillNotFound");
  });

  it("rolls back the payment when the payee rejects ETH", async function () {
    const receiver = await ethers.deployContract("RejectingReceiver");
    const block = await ethers.provider.getBlock("latest");
    await receiver.createBill(contract, payer.address, block.timestamp + 3600, ethers.hexlify(ethers.randomBytes(32)));
    const id = (await contract.nextBillId()) - 1n;
    await expect(contract.connect(payer).payInstallment(id, 0, { value: ethers.parseEther("1") }))
      .to.be.revertedWithCustomError(contract, "TransferFailed");
    const bill = await contract.getBill(id);
    expect(bill.paidAmount).to.equal(0n);
    expect(bill.status).to.equal(0n);
  });

  it("rolls back a refund when the original payer rejects ETH", async function () {
    const receiver = await ethers.deployContract("RejectingReceiver");
    const { id } = await create(1, [one, 0n], await receiver.getAddress());
    await receiver.payBill(contract, id, { value: one });
    await expect(contract.connect(payee).refundBill(id, one, { value: one }))
      .to.be.revertedWithCustomError(contract, "TransferFailed");
    const bill = await contract.getBill(id);
    expect(bill.paidAmount).to.equal(one);
    expect(bill.refundedAmount).to.equal(0n);
    expect(bill.status).to.equal(2n);
  });

  it("prevents a recipient callback from changing another bill state", async function () {
    const receiver = await ethers.deployContract("ReenteringPayee", [contract]);
    const block = await ethers.provider.getBlock("latest");
    await receiver.createBill(payer.address, block.timestamp + 3600, block.timestamp + 7200, ethers.hexlify(ethers.randomBytes(32)));
    const id = await receiver.billId();
    await contract.connect(payer).payInstallment(id, 0, { value: ethers.parseEther("1") });
    expect(await receiver.attempted()).to.equal(true);
    expect((await contract.getBill(id)).status).to.equal(1n);
  });
});
