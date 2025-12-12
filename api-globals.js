// api-globals.js — compatibility layer
// Maps old global names to new api.* methods so you don't need to change other files.

(function () {
  function ensureApiReady(cb) {
    if (window.api) return cb();
    setTimeout(() => ensureApiReady(cb), 50);
  }

  ensureApiReady(() => {
    window.fetchQuizzes = function () { return window.api.fetchQuizzes(); };
    window.createQuiz = function (payload) { return window.api.createQuiz(payload); };
    window.createQuestion = function (payload) { return window.api.createQuestion(payload); };
    window.createOption = function (payload) { return window.api.createOption(payload); };
    window.registerUser = function (payload) { return window.api.registerUser(payload); };
    window.loginUser = function (payload) { return window.api.loginUser(payload); };
    window.submitResult = function (payload) { return window.api.submitResult(payload); };

    console.log('api-globals initialized — legacy names mapped to api.*');
  });
})();

