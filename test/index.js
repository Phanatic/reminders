process.env.APP_ID = 1;

const expect = require('expect');
const {createRobot} = require('probot');
const plugin = require('..');
const chrono = require('chrono-node');

describe('PRobot-Snooze ', () => {
  let robot;
  let github;
  let commentEvent;

  beforeEach(() => {
    robot = createRobot();

    // Deep clone so later modifications don't mutate this.
    commentEvent = JSON.parse(JSON.stringify(require('./fixtures/issue_comment.created')));

    // Load the plugin
    // Mock out the GitHub API
    github = {
      integrations:{
        getInstallations: expect.createSpy()
      },
      paginate: expect.createSpy(),
      repos: {
        // Response for getting content from '.github/probot-freeze.yml'
        getContent: expect.createSpy().andReturn(Promise.resolve({
          data:{content: Buffer.from(`# Default length (in days) to freeze an item if no date is specified
defaultFreezeDuration: 7
#label applied to frozen issues. This is what the bot uses for its source of truth
labelName: 'probot:freeze'
# label color
labelColor: 'gray'
perform: true
`).toString('base64')
          }}))
      },
      issues: {
        createComment: expect.createSpy(),
        getLabel: null, //  Name: freeze.labelName
        createLabel: expect.createSpy(), // Name: freeze.config.labelName,          color: freeze.config.labelColor
        edit: expect.createSpy(),
        get: expect.createSpy().andReturn(Promise.resolve({data: {
          body: 'hello world'
        }}))
      },
      search: {
        issues: expect.createSpy().andReturn(Promise.resolve({
          data:{items: [{
            body: 'hello world\n\n<!-- probot = {"1":{"snooze":{"assignee":"baxterthehacker","unfreezeMoment":"2017-07-01T17:30:00.000Z","message":"Hey, we\'re back awake!"}}} -->',
            number: 2,
            labels:[{
              url: 'https://api.github.com/repos/baxterthehacker/public-repo/labels/probot:freeze',
              name: 'probot:freeze',
              color: 'fc2929'
            }]}]
          }})) // Q:'label:' + this.labelName
      }
    };

    // Mock out GitHub client
    robot.auth = () => Promise.resolve(github);

    plugin(robot);
  });

  it('resolves timezone issues with chrono-node', async () => {
/*  Save this code unless we need to review later

    console.log('current time', new Date());
    console.log('timezon offset', new Date().getTimezoneOffset());
    // PD reads the date as local.
    const parseDate = chrono.parseDate('July 1, 2018 13:30');
    console.log('pd', util.inspect(parseDate, {depth:null}));
    const mom = moment(parseDate);
    // Moment returns the date in local
    console.log('mom', util.inspect(mom, {depth:null}));
    mom.add(new Date().getTimezoneOffset(), 'minutes');
    console.log('mom in UTC', util.inspect(mom, {depth:null}));
    */
  });

  it('sets a reminder with slash commands', async () => {
    commentEvent.payload.comment.body = 'I am busy now, but will com back to this next quarter\n\n/remind me to check the spinaker on July 1, 2017';

    await robot.receive(commentEvent);

    expect(github.issues.edit({
      number:2,
      owner: 'baxterthehacker',
      repo: 'public-repo',
      state: 'closed',
      labels:[{
        url: 'https://api.github.com/repos/baxterthehacker/public-repo/labels/bug',
        name: 'bug',
        color: 'fc2929'
      },
        'probot:freeze']
    }));

    expect(github.issues.createComment).toHaveBeenCalledWith({
      number: 2,
      owner: 'baxterthehacker',
      repo: 'public-repo',
      body: 'Sure thing. I\'ll close this issue for a bit. I\'ll ping you around 07/01/2017 :clock1: '
    });

    const params = {
      assignee:'baxterthehacker',
      unfreezeMoment :chrono.parseDate('July 1, 2017'),
      message:'check the spinaker'
    };

    expect(github.issues.edit).toHaveBeenCalledWith({
      owner: 'baxterthehacker',
      repo: 'public-repo',
      number: 2,
      body: `hello world\n\n<!-- probot = {"1":{"snooze":${JSON.stringify(params)}}} -->`
    });
  });

  it('test visitor activation', async () => {
    await robot.receive({
      event: 'schedule',
      payload: {
        action: 'repository',
        repository: {
          owner: {
            login:'baxterthehacker'
          },
          name:'public-repo'
        },
        installation: {
          id: 13055
        }}});
    expect(github.repos.getContent).toHaveBeenCalledWith({
      owner: 'baxterthehacker',
      repo: 'public-repo',
      path: '.github/probot-snooze.yml'
    });
    expect(github.issues.edit).toHaveBeenCalledWith({
      labels: [],
      owner: 'baxterthehacker',
      repo: 'public-repo',
      number: 2,
      state: 'open'
    });
    expect(github.issues.createComment).toHaveBeenCalledWith({
      owner: 'baxterthehacker',
      repo: 'public-repo',
      number: 2,
      body: ':wave: @baxterthehacker, Hey, we\'re back awake!'
    });
  });
});
