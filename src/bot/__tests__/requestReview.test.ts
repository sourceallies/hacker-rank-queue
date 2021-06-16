describe('requestReview', () => {
  describe('setup', () => {
    beforeEach(() => {
      // TODO: run requestReview.shortcut();
    });

    it.todo('should run shortcut() when the "Request a Review" shortcut is pressed');

    it.todo('should run callback() after the user submits the "Request a Review" dialog');
  });

  describe('shortcut', () => {
    describe('when no errors occur', () => {
      beforeEach(() => {
        // TODO: run requestReview.shortcut();
      });

      it.todo("should acknowledge the request so slack knows we're working on it");

      it.todo("should show a dialog who's submit button triggers the callback() function");

      it.todo('should setup the first response block for the languages used');

      it.todo('should setup the second response block for when the reviews are needed by');

      it.todo('should setup the third response block for the number of reviewers necessary');

      it.todo('should default the number of reviewers to 2, the number required for a new hire');
    });

    describe('when the language cannot be retrieved', () => {
      beforeEach(() => {
        // TODO: run requestReview.shortcut();
      });

      it.todo('should attempt to load the available languages');

      it.todo('should send a message letting the user know that something went wrong');

      it.todo('should not show the "Request a Review" dialog');
    });

    describe('when the dialog fails to show', () => {
      beforeEach(() => {
        // TODO: run requestReview.shortcut();
      });

      it.todo('should load the available languages');

      it.todo('should attempt to show the "Request a Review" dialog');

      it.todo('should send a message letting the user know that something went wrong');
    });
  });

  describe('callback', () => {
    it.todo('should not be implemented yet');
  });
});
