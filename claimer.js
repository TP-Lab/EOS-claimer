var Async = require('async');
const Eos = require('eosjs');
const config = require('./config.json');
const httpEndPoint = config.httpEndPoint;
const chainId = config.chainId;

cacheRewards();
//try every 10 min
setInterval(cacheRewards, 10 * 60 * 1000 + 5000);

//////////////////////////
function cacheRewards() {
    var fns = [];
    const bps = config.bps;
    for (var i = 0; i < bps.length; ++i) {
        let bp = bps[i];
        var fn = function (bp) {
            const wif = bp.wif;
            const producerName = bp.producerName;
            const permission = bp.permission;
            console.log(" bp " + producerName);
            return function (callback) {
                var eos = Eos({
                    httpEndpoint: httpEndPoint, chainId: chainId,
                    keyProvider: wif
                });
                Promise.all([getGlobal(eos), getProducer(eos, producerName)]).then(([global, producer]) => {
                    let bpay = (global.perblock_bucket * producer.unpaid_blocks) / global.total_unpaid_blocks / 10000;
                    let vpay = (global.pervote_bucket * producer.total_votes) / (1 * global.total_producer_vote_weight) / 10000;
                    if (vpay < 100) {
                        vpay = 0;
                    }
                    let next_claim_time = 1 * new Date(producer.last_claim_time) + 24 * 60 * 60 * 1000;
                    console.log("current rewards block pay " + bpay + " vote pay " + vpay + " next claim time " + next_claim_time + " now " + Date.now());
                    if (next_claim_time > Date.now()) {
                        return 0;
                    }
                    return bpay + vpay;
                }, errs => {
                    console.error(errs);
                }).then(rewards => {
                    if (rewards > 0) {
                        eos.transaction({
                            // ...headers,
                            actions: [
                                {
                                    account: 'eosio',
                                    name: 'claimrewards',
                                    authorization: [{
                                        actor: producerName,
                                        permission: permission
                                    }],
                                    data: {
                                        owner: producerName
                                    }
                                }
                            ]
                        }).then(res => {
                            console.log(res);
                            let count = rewards.toFixed(4);
                            eos.transaction({
                                // ...headers,
                                actions: [
                                    {
                                        account: 'eosio.token',
                                        name: 'transfer',
                                        authorization: [{
                                            actor: producerName,
                                            permission: permission
                                        }],
                                        data: {
                                            "from": producerName,
                                            "to": "newdexwallet",
                                            "quantity": count + " BOS",
                                            "memo": "{\"type\":\"sell-market\",\"symbol\":\"eosio.token-bos-eos\",\"price\":\"0.00000\",\"count\":" + count + ",\"amount\":0,\"channel\":\"web\",\"receiver\":\"" + config.account + "\"}"
                                        }
                                    }
                                ]
                            }).then(res => {
                                console.log(res);
                                callback(null, count)
                            }, err => {
                                callback("sell bos error", err);
                            });
                        }, err => {
                            callback(err);
                        });
                    } else {
                        eos.getCurrencyBalance('eosio.token', producerName).then(function (value) {
                            console.log("sell bos " + value);
                            var quantity = value[0];
                            var count = quantity.split(" ")[0];
                            eos.transaction({
                                // ...headers,
                                actions: [
                                    {
                                        account: 'eosio.token',
                                        name: 'transfer',
                                        authorization: [{
                                            actor: producerName,
                                            permission: permission
                                        }],
                                        data: {
                                            "from": producerName,
                                            "to": "newdexwallet",
                                            "quantity": count + " BOS",
                                            "memo": "{\"type\":\"sell-market\",\"symbol\":\"eosio.token-bos-eos\",\"price\":\"0.00000\",\"count\":" + count + ",\"amount\":0,\"channel\":\"web\",\"receiver\":\"" + config.account + "\"}"
                                        }
                                    }
                                ]
                            }).then(res => {
                                console.log(res);
                            }, err => {
                                console.log("sell bos error ", err);
                            });
                        }).catch(function (reason) {
                            console.log("get balance error", reason);
                        });
                    }
                });
            };
        }
        fns.push(fn(bp));
        Async.parallelLimit(fns, 3, function (err, results) {
            var eos = Eos({
                httpEndpoint: config.eosHttpEndPoint, chainId: config.eosChainId,
                keyProvider: config.wif
            });
            eos.getCurrencyBalance('eosio.token', config.account).then(function (value) {
                console.log("buy tpt " + value);
                var quantity = value[0];
                var count = quantity.split(" ")[0];
                eos.transaction({
                    // ...headers,
                    actions: [
                        {
                            account: 'eosio.token',
                            name: 'transfer',
                            authorization: [{
                                actor: config.account,
                                permission: "active"
                            }],
                            data: {
                                "from": config.account,
                                "to": "newdexpocket",
                                "quantity": quantity,
                                "memo": "{\"type\":\"buy-market\",\"symbol\":\"eosiotptoken-tpt-eos\",\"price\":\"0.000000\",\"count\":0,\"amount\":" + count + ",\"channel\":\"tokenpocket\"}"
                            }
                        }
                    ]
                }).then(res => {
                    console.log(res);
                }, err => {
                    console.log("buy tpt error ", err);
                });
            }).catch(function (reason) {
                console.log("get balance error", reason);
            });
        });
    }
}

function getGlobal(eos) {
    return new Promise((resolve, reject) => {
        eos.getTableRows({
            "scope": "eosio",
            "code": "eosio",
            "table": "global",
            "json": true
        }).then(res => {
            resolve(res.rows[0]);
        }, err => {
            console.error(err);
            reject(err);
        });
    });
}

function getProducer(eos, name) {
    return new Promise((resolve, reject) => {
        eos.getTableRows({
            "scope": "eosio",
            "code": "eosio",
            "table": "producers",
            "lower_bound": name,
            "limit": 1,
            "json": true
        }).then(res => {
            if (!res.rows[0] || name != res.rows[0].owner) {
                reject("producer not exist!");
            }
            resolve(res.rows[0]);
        }, err => {
            console.error(err);
            reject(err);
        });
    });
}

