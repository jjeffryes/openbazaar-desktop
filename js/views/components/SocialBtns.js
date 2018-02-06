import app from '../../app';
import loadTemplate from '../../utils/loadTemplate';
import { followedByYou, followUnfollow } from '../../utils/follow';
import BlockBtn from './BlockBtn';

import BaseVw from '../baseVw';

export default class extends BaseVw {
  constructor(options = {}) {
    if (!options.targetID) throw new Error('You must provide a targetID');

    const opts = {
      ...options,
      initialState: {
        following: followedByYou(options.targetID),
        isFollowing: false,
        stripClasses: 'btnStrip clrSh3',
        btnClasses: 'clrP clrBr',
        ...options.initialState || {},
      },
    };

    super(opts);
    this.options = opts;

    this.listenTo(app.ownFollowing, 'update', () => {
      this.setState({
        following: followedByYou(options.targetID),
      });
    });
  }

  className() {
    return 'socialBtns';
  }

  events() {
    return {
      'click .js-followUnfollowBtn': 'onClickFollow',
      'click .js-messageBtn': 'onClickMessage',
    };
  }

  onClickMessage() {
    // activate the chat message
    app.chat.openConversation(this.options.targetID);
  }

  onClickFollow() {
    const type = this.getState().following ? 'unfollow' : 'follow';
    this.setState({ isFollowing: true });
    this.folCall = followUnfollow(this.options.targetID, type)
      .always(() => {
        if (this.isRemoved()) return;
        this.setState({ isFollowing: false });
      });
  }

  render() {
    super.render();
    const state = this.getState();
    loadTemplate('components/socialBtns.html', (t) => {
      this.$el.html(t({
        ...this.options,
        ...state,
      }));
    });

    this.getCachedEl('.js-blockBtnContainer')
      .html(
        new BlockBtn({ targetId: this.options.targetID })
          .render()
          .el
      );

    return this;
  }
}
