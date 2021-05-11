module.exports = {
  test: {
    script: 'jest {HOLA=asd}',
    description: 'run jest test',
    filter: ['test'],
    root: false,
    before: ({ script, cwd, pakcageJson }) => {
      console.log('script, cwd, pakcageJson: ', script, cwd, pakcageJson);
      return { script, cwd };
    },
  },
};
