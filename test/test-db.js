var sinon = require('sinon');
var server = require('../server.js');
var assert = require('assert');
var mock;

//var a = [];

//mock = sinon.mock(require('nano')('http://localhost:8000'));
//mock.expects('use').with('users').returns(a);

var NUM_TEST_USERS = 10;

/**
 * Create a test User
 */
function createTestUser(id) {
    return { id : id };
}

/**
 * Create some users for testing
 */
function createTestUsers() {
    var users = [];
    for (var i = 0; i < 10; i++) {
       users.push(createTestUser(i)); 
    }
    return users;
}

describe('processUser function', function() {
    var data = new Object();
    data.rows = createTestUsers();
    
    it ('when no error, should return a list of users', function() {
        var response = server.processUser(null, data);
        assert.equal("Users", response.title);
        assert.equal(data.rows.length, response.data.length);
        
        // data should be same as passed in
        for (var i = 0; i< data.rows.length; i++) {
            assert.equal(data.rows[i], response.data[i]);
        }
    });

    it ('when error is present, should return error message', function() {
        var error = { errorMsg : "fakeErrorMessage" };
        var response = server.processUser(error, data);

        assert.equal("Error", response.title);
        assert.equal(0, response.data.length);
        assert.equal(error, response.error);
    });
})

