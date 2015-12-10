/**
 * Grafana Datasource Plugin for PRTG API Interface (ALPHA)
 * Datasource Definition
 * 20151206 03:10 Jason Lashua
 * Proof of Concept. Based on publicly available plugins.
 *
 * DOES: Gets data by channel by device. Groups, Devices, Sensors and Channels available.
 * DOES NOT (yet): Trending, Histoic Data, Templating, Annotations
 */
'use strict';
define([
  'angular',
  'lodash',
  'app/core/utils/datemath',
  './directives',
  './api_wrapper',
  './query_ctrl'
],
function (angular, _, dateMath) {
    var module = angular.module('grafana.services');

    module.factory('PRTGAPIDataSource', function($q, backendSrv, templateSrv, alertSrv, PRTGAPI) {
        
        /**
         * PRTG Datasource
         * 
         * @param {object} Grafana Datasource Object
         */
        function PRTGAPIDataSource(datasource) {
            this.name =     datasource.name;
            this.url =      datasource.url;
            this.username = datasource.jsonData.prtgApiUser;
            this.password = datasource.jsonData.prtgApiPassword;
            this.useCache = datasource.jsonData.useCache || false;
            this.cacheTimeoutMintues = datasource.jsonData.cacheTimeoutMinutes || 5;
            this.limitmetrics = datasource.meta.limitmetrics || 100;
            this.prtgAPI = new PRTGAPI(this.url, this.username, this.password, this.useCache, this.cacheTimeoutMintues);
        }
        
        PRTGAPIDataSource.prototype.testDatasource = function() {
            var self = this;
            return this.prtgAPI.getVersion().then(function (apiVersion) {
                return self.prtgAPI.performPRTGAPILogin().then(function (auth) {
                    if (auth) {
                        return {
                            status: "success",
                            title: "Success",
                            message: "PRTG API version: " + apiVersion
                            };
                    } else {
                        return {
                            status: "error",
                            title: "Invalid user name or password",
                            message: "PRTG API version: " + apiVersion
                            };
                    }
                });
            }, function(error) {
                return {
                    status: "error",
                    title: "Connection failed",
                    message: "Could not connect to " + error.config.url
                };
            });
        };
    
        
        /**
         * Data Source Query
         * returns timeseries array of values
         * 
         * @param {object} options; Dataset Options including targets, etc.
         * @return [array]
         */
        PRTGAPIDataSource.prototype.query = function(options) {
            
            var from = Math.ceil(dateMath.parse(options.range.from) / 1000);
            var to = Math.ceil(dateMath.parse(options.range.to) / 1000);
			
            var useLive = options.livegraph;
            var promises = _.map(options.targets, function(target) {
                if (target.hide || !target.group || !target.device
                                || !target.channel || !target.sensor) {
                    
                    return [];
                }
                
                /*
                 // Replace templated variables
                var groupName = templateSrv.replace(target.group.name);
                var deviceName  = templateSrv.replace(target.device.name);
                var sensorName   = templateSrv.replace(target.sensor.name);
                var channelName  = templateSrv.replace(target.channel.name);
                */
                var group = target.group.name;
                var device = target.device.name;
                var sensor = target.sensor.name;
                var channel = target.channel.name;
                var self = this;
                return this.prtgAPI.getValues(sensor, channel, from, to).then(function (values) {
                    var alias = channel === 'All' || sensor.length > 1 ? undefined : target.alias;
                    var timeseries = {target:target.channel.visible_name, datapoints: values};
                    return timeseries;
                });
            }, this);
            
            return $q.all(_.flatten(promises)).then(function (results) {
                return {data: results};
            });
        }
        
        PRTGAPIDataSource.prototype.annotationQuery = function(options) {
            var from = Math.ceil(dateMath.parse(options.range.from) / 1000);
            var to = Math.ceil(dateMath.parse(options.range.to) / 1000);
            return this.prtgAPI.getMessages(from, to, options.annotation.sensorId).then(function (messages) {
                _.each(messages, function (message) {
                    message.annotation = options.annotation; //inject the annotation into the object
                });
                return messages;
            });
        }
        
        return PRTGAPIDataSource;
    });
});


