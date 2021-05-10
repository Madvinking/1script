module.exports = {
  lint: 'eslint {{DIR=HOPA}} {{YABLOLO}} .',
  test: {
    script: 'jest -',
    description: 'run jest test',
    excludes: ['test'],
    before: ({ script, cwd, pakcageJson }) => {
      console.log('script, cwd, pakcageJson: ', script, cwd, pakcageJson);
    },
  },
};
