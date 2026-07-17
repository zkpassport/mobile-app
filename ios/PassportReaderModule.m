//
//  PassportReaderModule.m
//  ProofOfPassport
//
//  Created by Theo Madzou on 02/02/2024.
//

#import <Foundation/Foundation.h>
#import "React/RCTBridgeModule.h"

@interface RCT_EXTERN_MODULE(PassportReaderModule, NSObject)

RCT_EXTERN_METHOD(scan:(NSString *)passportNumber
                  dateOfBirth:(NSString *)dateOfBirth
                  dateOfExpiry:(NSString *)dateOfExpiry
                  isPacePolling:(BOOL)isPacePolling
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
