import $ from 'jquery';
import { estimateFee } from '../../../utils/fees';
import app from '../../../app';
import loadTemplate from '../../../utils/loadTemplate';
import baseVw from '../../baseVw';

export default class extends baseVw {
  constructor(options = {}) {
    super(options);

    this._state = {
      show: false,
      fetchingFee: false,
      fetchFailed: false,
      fetchError: '',
      fee: false,
      displayCurrency: app.settings.get('localCurrency') || 'BTC',
      btnSendText: app.polyglot.t('wallet.spendConfirmBox.btnConfirmSend'),
      ...options.initialState || {},
    };

    this.lastFetchFeeEstimateArgs = {};
    this.boundDocumentClick = this.onDocumentClick.bind(this);
    $(document).on('click', this.boundDocumentClick);
  }

  className() {
    return 'spendConfirmBox centeredBelow';
  }

  events() {
    return {
      'click .js-btnConfirmSend': 'onClickSend',
      'click .js-sendConfirmCancel': 'onClickCancel',
      'click .js-sendConfirmRetry': 'onClickRetry',
      'click .js-sendConfirmClose': 'onClickCancel',
    };
  }

  onDocumentClick(e) {
    if (this.getState().show &&
      !($.contains(this.el, e.target) ||
        e.target === this.el)) {
      this.setState({ show: false });
    }
  }

  onClickSend(e) {
    this.trigger('clickSend');
    e.stopPropagation();
  }

  onClickCancel(e) {
    this.setState({ show: false });
    e.stopPropagation();
  }

  onClickRetry(e) {
    const amount = this.lastFetchFeeEstimateArgs.amount;
    if (typeof amount === 'number') {
      this.fetchFeeEstimate(amount, this.lastFetchFeeEstimateArgs.feeLevel || null);
    }
    e.stopPropagation();
  }

  fetchFeeEstimate(amount, feeLevel = app.localSettings.get('defaultTransactionFee')) {
    if (typeof amount !== 'number') {
      throw new Error('Please provide an amount as a number.');
    }

    this.lastFetchFeeEstimateArgs = {
      amount,
      feeLevel,
    };

    this.setState({
      fetchingFee: true,
      fetchError: '',
      fetchFailed: false,
    });

    estimateFee(feeLevel, amount)
      .done(fee => {
        let state = {
          fee,
          fetchingFee: false,
        };

        if (fee + amount > app.walletBalance.get('confirmed')) {
          state = {
            // The fetch didn't actually fail, but since the server allows unconfirmed spends and
            // we don't want to allow that, we'll pretend it failed and simulate the server
            // ERROR_INSUFFICIENT_FUNDS error.
            fetchFailed: true,
            fetchError: 'ERROR_INSUFFICIENT_FUNDS',
            ...state,
          };
        }

        this.setState(state);
      }).fail(xhr => {
        this.setState({
          fetchingFee: false,
          fetchFailed: true,
          fetchError: xhr && xhr.responseJSON && xhr.responseJSON.reason || '',
        });
      });
  }

  remove() {
    $(document).off('click', this.boundDocumentClick);
    super.remove();
  }

  render() {
    loadTemplate('modals/wallet/spendConfirmBox.html', (t) => {
      this.$el.html(t({
        ...this._state,
      }));
    });

    return this;
  }
}
