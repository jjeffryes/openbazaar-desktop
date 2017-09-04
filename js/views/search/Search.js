import _ from 'underscore';
import $ from 'jquery';
import is from 'is_js';
import baseVw from '../baseVw';
import loadTemplate from '../../utils/loadTemplate';
import app from '../../app';
import { openSimpleMessage } from '../modals/SimpleMessage';
import Dialog from '../modals/Dialog';
import Results from './Results';
import ResultsCol from '../../collections/Results';
import Providers from './SearchProviders';
import ProviderMd from '../../models/search/SearchProvider';
import defaultSearchProviders from '../../data/defaultSearchProviders';
import { selectEmojis } from '../../utils';
import { getCurrentConnection } from '../../utils/serverConnect';

export default class extends baseVw {
  constructor(options = {}) {
    const opts = {
      initialState: {
        fetching: false,
        ...options.initialState,
      },
      ...options,
    };

    super(opts);
    this.options = opts;
    // in the future the may be more possible types
    this.urlType = this.usingTor ? 'torlistings' : 'listings';

    this.sProvider = app.searchProviders[`default${this.torString}Provider`];

    // if the  provider returns a bad URL, the user must select a provider
    if (is.not.url(this.providerUrl)) {
      // use the first default temporarily to construct the tempUrl below
      this.sProvider = app.searchProviders.get(defaultSearchProviders[0].id);
      this.mustSelectDefault = true;
    }

    const tempUrl = new URL(`${this.providerUrl}?${options.query || ''}`);
    let queryParams = tempUrl.searchParams;

    // if a url with parameters was in the query in, use the parameters in it instead.
    if (queryParams.get('providerQ')) {
      const subURL = new URL(queryParams.get('providerQ'));
      queryParams = subURL.searchParams;
      const base = `${subURL.origin}${subURL.pathname}`;
      const matchedProvider =
        app.searchProviders.filter(p =>
          base === p.get('listings') || base === p.get('torlistings'));

      /* if the query provider doesn't exist, create a temporary provider model for it.
         One quirk to note: if a tor url is passed in while the user is in clear mode, and an
         existing provider has that tor url, that provider will be activated but will use its
         clear url if it has one. The opposite is also true.
       */
      if (!matchedProvider.length) {
        const queryOpts = {};
        queryOpts[`${this.usingTor ? 'tor' : ''}listings`] = `${subURL.origin}${subURL.pathname}`;
        this.queryProvider = new ProviderMd(queryOpts);
      } else {
        this.sProvider = matchedProvider[0];
        this.queryProvider = null;
      }
    }

    const params = {};

    for (const param of queryParams.entries()) {
      params[param[0]] = param[1];
    }

    // use the parameters from the query unless they were overridden in the options
    this.serverPage = options.serverPage || params.p || 0;
    this.pageSize = options.pageSize || params.ps || 24;
    this.term = options.term || params.q || '';
    this.sortBySelected = options.sortBySelected || params.sortBy || '';
    // all parameters not specified above are assumed to be filters
    this.filters = _.omit(params, ['q', 'p', 'ps', 'sortBy', 'providerQ']);

    this.processTerm(this.term);
  }

  className() {
    return 'search';
  }

  events() {
    return {
      'click .js-searchBtn': 'clickSearchBtn',
      'change .js-sortBy': 'changeSortBy',
      'change .js-filterWrapper select': 'changeFilter',
      'change .js-filterWrapper input': 'changeFilter',
      'keyup .js-searchInput': 'onKeyupSearchInput',
      'click .js-deleteProvider': 'clickDeleteProvider',
      'click .js-makeDefaultProvider': 'clickMakeDefaultProvider',
      'click .js-addQueryProvider': 'clickAddQueryProvider',
    };
  }

  get usingOriginal() {
    return this.sProvider.id === defaultSearchProviders[0].id;
  }

  get usingTor() {
    return app.serverConfig.tor && getCurrentConnection().server.get('useTor');
  }

  get torString() {
    return this.usingTor ? 'Tor' : '';
  }

  get providerUrl() {
    // if a provider was created by the address bar query, use it instead.
    // return false if no provider is available
    const currentProvider = this.queryProvider || this.sProvider;
    return currentProvider && currentProvider.get(this.urlType);
  }

  getCurrentProviderID() {
    // if the user must select a default, or the provider is from the query, return no id
    return this.queryProvider || this.mustSelectDefault ? '' : this.sProvider.id;
  }

  /**
   * This will create a url with the term and other query parameters
   * @param {string} term
   */
  processTerm(term) {
    this.term = term || '';
    // if term is false, search for *
    const query = `q=${encodeURIComponent(term || '*')}`;
    const page = `&p=${this.serverPage}&ps=${this.pageSize}`;
    const sortBy = this.sortBySelected ? `&sortBy=${encodeURIComponent(this.sortBySelected)}` : '';
    const network = `&network=${!!app.serverConfig.testnet ? 'testnet' : 'mainnet'}`;
    let filters = $.param(this.filters);
    filters = filters ? `&${filters}` : '';
    const newURL = `${this.providerUrl}?${query}${network}${sortBy}${page}${filters}`;
    this.callSearchProvider(newURL);
  }

  /**
   * This will activate a provider. If no default is set, the activated provider will be set as the
   * the default. If the user is currently in Tor mode, the default Tor provider will be set.
   * @param md the search provider model
   */
  activateProvider(md) {
    if (!md || !(md instanceof ProviderMd)) {
      throw new Error('Please provide a search provider model.');
    }
    if (app.searchProviders.indexOf(md) === -1) {
      throw new Error('The provider must be in the collection.');
    }
    this.sProvider = md;
    this.queryProvider = null;
    if (this.mustSelectDefault) {
      this.mustSelectDefault = false;
      this.makeDefaultProvider();
    }
    this.processTerm(this.term);
  }

  deleteProvider(md = this.sProvider) {
    if (md.get('locked')) {
      openSimpleMessage(app.polyglot.t('search.errors.locked'));
    } else {
      md.destroy();
      if (app.searchProviders.length) this.activateProvider(app.searchProviders.at(0));
    }
  }

  clickDeleteProvider() {
    this.deleteProvider();
  }

  makeDefaultProvider() {
    app.searchProviders[`default${this.torString}Provider`] = this.sProvider;
    this.getCachedEl('.js-makeDefaultProvider').addClass('hide');
  }

  clickMakeDefaultProvider() {
    this.makeDefaultProvider();
  }

  addQueryProvider() {
    if (this.queryProvider) app.searchProviders.add(this.queryProvider);
    this.activateProvider(this.queryProvider);
  }

  clickAddQueryProvider() {
    this.addQueryProvider();
  }

  callSearchProvider(searchUrl) {
    // remove a pending search if it exists
    if (this.callSearch) this.callSearch.abort();

    this.setState({
      fetching: true,
      selecting: this.mustSelectDefault,
      data: '',
      searchUrl,
      xhr: '',
    });

    if (!this.mustSelectDefault) {
      // query the search provider
      this.callSearch = $.get({
        url: searchUrl,
        dataType: 'json',
      })
        .done((data, status, xhr) => {
          // make sure minimal data is present
          if (data.name && data.links) {
            // if data about the provider is recieved, update the model
            const update = { name: data.name };
            const urlTypes = [];
            if (data.logo && is.url(data.logo)) update.logo = data.logo;
            if (data.links) {
              if (is.url(data.links.search)) {
                update.search = data.links.search;
                urlTypes.push('search');
              }
              if (is.url(data.links.listings)) {
                update.listings = data.links.listings;
                urlTypes.push('listings');
              }
              if (data.links.tor) {
                if (is.url(data.links.tor.search)) {
                  update.torsearch = data.links.tor.search;
                  urlTypes.push('torsearch');
                }
                if (is.url(data.links.tor.listings)) {
                  update.torlistings = data.links.tor.listings;
                  urlTypes.push('torlistings');
                }
              }
            }
            // update the defaults but do not save them
            if (!_.findWhere(defaultSearchProviders, { id: this.sProvider.id })) {
              this.sProvider.save(update, { urlTypes });
            } else {
              this.sProvider.set(update, { urlTypes });
            }
            this.setState({
              fetching: false,
              selecting: false,
              data,
              searchUrl,
              xhr: '',
            });
          } else {
            this.setState({
              fetching: false,
              selecting: false,
              data: '',
              searchUrl,
              xhr,
            });
          }
        })
        .fail((xhr) => {
          if (xhr.statusText !== 'abort') {
            this.setState({
              fetching: false,
              selecting: false,
              data: '',
              searchUrl,
              xhr,
            });
          }
        });
    }
  }

  showSearchError(xhr = {}) {
    const title = app.polyglot.t('search.errors.searchFailTitle', { provider: this.sProvider });
    const failReason = xhr.responseJSON ? xhr.responseJSON.reason : '';
    const msg = failReason ?
                app.polyglot.t('search.errors.searchFailReason', { error: failReason }) : '';
    const buttons = [];
    if (this.usingOriginal) {
      buttons.push({
        text: app.polyglot.t('search.changeProvider'),
        fragment: 'changeProvider',
      });
    } else {
      buttons.push({
        text: app.polyglot.t('search.useDefault',
          {
            term: this.term,
            defaultProvider: app.searchProviders[`default${this.torString}Provider`],
          }),
        fragment: 'useDefault',
      });
    }

    const errorDialog = new Dialog({
      title,
      msg,
      buttons,
      showCloseButton: false,
      removeOnClose: true,
    }).render().open();
    this.listenTo(errorDialog, 'click-changeProvider', () => {
      errorDialog.close();
    });
    this.listenTo(errorDialog, 'click-useDefault', () => {
      this.activateProvider(app.searchProviders.at(0));
      errorDialog.close();
    });
  }

  createResults(data, searchUrl) {
    this.resultsCol = new ResultsCol();
    this.resultsCol.add(this.resultsCol.parse(data));

    const resultsView = this.createChild(Results, {
      searchUrl,
      total: data.results ? data.results.total : 0,
      morePages: data.results ? data.results.morePages : false,
      serverPage: this.serverPage,
      pageSize: this.pageSize,
      initCol: this.resultsCol,
    });

    this.$resultsWrapper.html(resultsView.render().el);

    this.listenTo(resultsView, 'searchError', (xhr) => this.showSearchError(xhr));
    this.listenTo(resultsView, 'loadingPage', () => this.scrollToTop());
  }

  clickSearchBtn() {
    this.serverPage = 0;
    this.processTerm(this.$searchInput.val());
  }

  onKeyupSearchInput(e) {
    if (e.which === 13) {
      this.serverPage = 0;
      this.processTerm(this.$searchInput.val());
    }
  }

  changeSortBy(e) {
    this.sortBySelected = $(e.target).val();
    this.processTerm(this.term);
  }

  changeFilter(e) {
    const targ = $(e.target);
    this.filters[targ.prop('name')] = targ.val();
    this.processTerm(this.term);
  }

  scrollToTop() {
    this.$el[0].scrollIntoView();
  }

  remove() {
    if (this.callSearch) this.callSearch.abort();
    super.remove();
  }

  render() {
    super.render();
    const state = this.getState();
    const data = state.data;

    if (data && !state.searchUrl) {
      throw new Error('Please provide the search URL along with the data.');
    }

    let errTitle;
    let errMsg;

    // check to see if the call to the provider failed, or returned an empty result
    const emptyData = $.isEmptyObject(data);

    if (state.xhr) {
      errTitle = app.polyglot.t('search.errors.searchFailTitle', { provider: state.searchUrl });
      const failReason = state.xhr.responseJSON ? state.xhr.responseJSON.reason : '';
      errMsg = failReason ?
        app.polyglot.t('search.errors.searchFailReason', { error: failReason }) : '';
    }

    loadTemplate('search/Search.html', (t) => {
      this.$el.html(t({
        term: this.term === '*' ? '' : this.term,
        sortBySelected: this.sortBySelected,
        filterVals: this.filters,
        errTitle,
        errMsg,
        providerLocked: this.sProvider.get('locked'),
        isQueryProvider: !!this.queryProvider,
        isDefaultProvider: this.sProvider === app.searchProviders.defaultProvider,
        emptyData,
        ...state,
        ...this.sProvider,
        ...data,
      }));
    });
    this.$sortBy = this.$('#sortBy');
    this.$sortBy.select2({
      // disables the search box
      minimumResultsForSearch: Infinity,
      templateResult: selectEmojis,
      templateSelection: selectEmojis,
    });
    const filterWrapper = this.$('.js-filterWrapper');
    filterWrapper.find('select').select2({
      // disables the search box
      minimumResultsForSearch: Infinity,
      templateResult: selectEmojis,
      templateSelection: selectEmojis,
    });
    this.$filters = filterWrapper.find('select, input');
    this.$resultsWrapper = this.$('.js-resultsWrapper');
    this.$searchInput = this.$('.js-searchInput');
    this.$searchLogo = this.$('.js-searchLogo');

    this.$searchLogo.find('img').on('error', () => {
      this.$searchLogo.addClass('loadError');
    });

    if (this.searchProviders) this.searchProviders.remove();
    this.searchProviders = this.createChild(Providers, {
      urlType: this.urlType,
      currentID: this.getCurrentProviderID(),
      selecting: this.mustSelectDefault,
    });
    this.listenTo(this.searchProviders, 'activateProvider', pOpts => this.activateProvider(pOpts));
    this.$('.js-searchProviders').append(this.searchProviders.render().el);

    // use the initial set of results data to create the results view
    if (data) this.createResults(data, state.searchUrl);

    return this;
  }
}
