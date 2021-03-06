import _ from 'lodash';
import * as dateMath from 'app/core/utils/datemath';
import './PRTGAPIService';

class PRTGDataSource {
    
    /** @ngInject */
    constructor(instanceSettings, templateSrv, alertSrv, PRTGAPIService) {
        /**
        * PRTG Datasource
        * 
        * @param {object} Grafana Datasource Object
        */
        this.templateSrv = templateSrv;
        this.alertServ = alertSrv;
        
        this.name =     instanceSettings.name;
        this.url =      instanceSettings.url;
        this.username = instanceSettings.jsonData.prtgApiUser;
        this.passhash = instanceSettings.jsonData.prtgApiPasshash;
        this.cacheTimeoutMintues = instanceSettings.jsonData.cacheTimeoutMinutes || 5;
        this.limitmetrics = instanceSettings.meta.limitmetrics || 100;
        this.prtgAPI = new PRTGAPIService(this.url, this.username, this.passhash, this.cacheTimeoutMintues);
    }

        /**
         * Test the datasource
         */
        testDatasource() {
            return this.prtgAPI.getVersion().then(apiVersion => {
                return this.prtgAPI.performPRTGAPILogin()
                    .then(() => {
                        return {
                            status: "success",
                            title: "Success",
                            message: "PRTG API version: " + apiVersion
                        };
                });
            }, error => {
                console.log(JSON.stringify(error,null,4));
                return {
                    status: "error",
                    title: error.status + ": " + error.statusText,
                    message: ""//error.config.url
                };
            });
        }
    
        
        /**
         * Data Source Query
         * returns timeseries array of values
         * 
         * @param {object} options; Dataset Options including targets, etc.
         * @return [array]
         */
        query(options) {
            var from = Math.ceil(dateMath.parse(options.range.from) / 1000);
            var to = Math.ceil(dateMath.parse(options.range.to) / 1000);
            var promises = _.map(options.targets, target => {
                if (target.hide || !target.group || !target.device || !target.channel || !target.sensor) {
                    return [];
                }
                
                var device, group, sensor, channel = "";
                group = this.templateSrv.replace(target.group.name);
                device   = this.templateSrv.replace(target.device.name);
                sensor   = this.templateSrv.replace(target.sensor.name);
                channel  = this.templateSrv.replace(target.channel.name);

                return this.prtgAPI.getValues(device, sensor, channel, from, to)
                    .then(values => {                
                        var timeseries = {target:target.alias, datapoints: values};
                        return timeseries;
                    });
            });
            
            return Promise.all(_.flatten(promises))
                .then(results => {
                    return {data: results};
                });
        }
        
       annotationQuery (options) {
            var from = Math.ceil(dateMath.parse(options.range.from) / 1000);
            var to = Math.ceil(dateMath.parse(options.range.to) / 1000);
            return this.prtgAPI.getMessages(from, to, options.annotation.sensorId)
                .then(messages => {
                    _.each(messages, message => {
                        message.annotation = options.annotation; //inject the annotation into the object
                    }, this);
                return messages;
            });
        }

        /* Find Metrics from templated letiables
         *
         * channel templates are limited to lookup by sensor's numeric ID.
         *
         * @param query Query string:
         * channel:sensor=####
         * sensor:device=$device or * or numeric ID
         * device:group=$group or * or numeric ID
         * group:* or name
         */
        metricFindQuery (query) {
            if (!query.match(/(channel|sensor|device|group):(\*)|(tags|sensor|device|group)=([\$\sa-zA-Z0-9-_]+)/i)) {
                return Promise.reject("Syntax Error: Expected pattern matching /(sensors|devices|groups):(\*)|(tags|device|group)=([a-zA-Z0-9]+)/i");
            }
            var params = "";
            var a = query.split(':');
            if (a[0] == "channel") {
                var b = a[1].split('=');
                params = "&content=channels&columns=name&id=" + b[1];
                a[0]="name";
            } else {
                params="&content=" + a[0] + "s";
                if (a[1] !== '*') {
                    params = params + "&filter_" + this.templateSrv.replace(a[1]);
                }
            }
            return this.prtgAPI.performPRTGAPIRequest('table.json', params)
                .then(results => {
                    return _.map(results, res => {
                        return {text: res[a[0]], expandable:0};
                    }, this);
            });
            
        }

 
}

export { PRTGDataSource };

