import app from '../../../../app';
import BaseVw from '../../../baseVw';
import loadTemplate from '../../../../utils/loadTemplate';
import Contract from './Contract';

export default class extends BaseVw {
  constructor(options = {}) {
    super(options);

    if (!this.model) {
      throw new Error('Please provide a model.');
    }

    this.options = options || {};

    if (this.isCase &&
      (!this.model.get('vendorContract') ||
        !this.model.get('buyerContract'))) {
      this.listenTo(this.model, 'otherContractArrived', (md, data) => {
        const rawContract = this.model.get(`raw${data.isBuyer ? 'Buyer' : 'Vendor'}Contract`);

        if (!this.model.bothContractsValid) this.renderContract(rawContract);
        this.renderStatus();

        if (this.model.bothContractsValid) {
          this[`${data.isBuyer ? 'vendor' : 'buyer'}ContractVw`].setState({ heading: '' });
        }
      });
    }
  }

  className() {
    return 'contractTab';
  }

  events() {
    return {
      'click .js-backToSummary': 'onClickBackToSummary',
      'click .renderjson a': 'onClickRenderjsonLink',
    };
  }

  onClickBackToSummary() {
    this.trigger('clickBackToSummary');
  }

  onClickRenderjsonLink() {
    return false;
  }

  get isCase() {
    return this.model.get('buyerOpened') !== undefined;
  }

  renderStatus() {
    let msg = '';

    if (this.isCase) {
      // Cut a corner with some html embedded here. If the html get more elaborate than this,
      // we should probably break this out into its own template.
      if (this.model.bothContractsValid) {
        msg = '<p class="clrTEm flexVCent"><span class="ion-ios-checkmark-outline margRSm">' +
          `</span>${app.polyglot.t('orderDetail.contractTab.bothContractsValid')}</p>`;
      } else if (!this.model.get('vendorContract')) {
        msg = '<p class="flexVCent"><span class="ion-android-warning margRSm clrTAlert">' +
          `</span>${app.polyglot.t('orderDetail.contractTab.vendorContractNotArrived')}</p>`;
      } else if (!this.model.get('buyerContract')) {
        msg = '<p class="flexVCent"><span class="ion-android-warning margRSm clrTAlert">' +
          `</span>${app.polyglot.t('orderDetail.contractTab.buyerContractNotArrived')}</p>`;
      }
    }

    this.getCachedEl('.js-statusContainer')
      .html(msg);
  }

  renderContract(contract) {
    if (!contract) {
      throw new Error('Please provide a contract.');
    }

    const isBuyerContract = contract === this.model.get('rawBuyerContract');
    let heading = '';

    if (!this.model.bothContractsValid) {
      heading = isBuyerContract ?
        app.polyglot.t('orderDetail.contractTab.contractHeadingBuyer') :
        app.polyglot.t('orderDetail.contractTab.contractHeadingVendor');
    }

    const view = this[`${isBuyerContract ? 'buyer' : 'vendor'}ContractVw`] =
      this.createChild(Contract, {
        contract,
        initialState: {
          heading,
          errors: isBuyerContract ?
            this.model.get('buyerContractValidationErrors') || [] :
            this.model.get('vendorContractValidationErrors') || [],
        },
      });

    this.$el.append(view.render().el);
  }

  render() {
    loadTemplate('modals/orderDetail/contractTab/contractTab.html', t => {
      this.$el.html(t());
      this.renderStatus();

      if (!this.isCase) {
        this.contractVw = this.createChild(Contract, {
          contract: this.model.get('rawContract'),
        });
        this.$el.append(this.contractVw.render().el);
      } else {
        const contracts = [
          this.model.get('buyerOpened') ?
            this.model.get('rawBuyerContract') :
            this.model.get('rawVendorContract'),
        ];

        if (!this.model.bothContractsValid) {
          // If the second contract has arrived, we'll show them individually since one or
          // both have validation errors.
          if (this.model.get('buyerOpened')) {
            if (this.model.get('vendorContract')) {
              contracts.push(this.model.get('rawVendorContract'));
            }
          } else if (this.model.get('buyerContract')) {
            contracts.push(this.model.get('rawBuyerContract'));
          }
        }

        contracts.forEach(contract => this.renderContract(contract));
      }
    });

    return this;
  }
}
