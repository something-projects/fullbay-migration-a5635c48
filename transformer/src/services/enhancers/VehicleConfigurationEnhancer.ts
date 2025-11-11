/**
 * Vehicle Configuration Enhancer
 * Enhances standardized vehicles with detailed AutoCare VCdb configuration data
 */

import { 
  AutoCareData, 
  StandardizedVehicle, 
  VCdbVehicle,
  VehicleEngineInfo,
  VehicleTransmissionInfo,
  VehicleBodyInfo,
  VehicleBrakeInfo
} from '../../types/AutoCareTypes';

export class VehicleConfigurationEnhancer {
  private autoCareData: AutoCareData;

  constructor(autoCareData: AutoCareData) {
    this.autoCareData = autoCareData;
  }

  /**
   * Enhance vehicle with all available configuration data
   */
  enhanceVehicle(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    this.addEngineConfiguration(vehicle, vcdbVehicle);
    this.addTransmissionConfiguration(vehicle, vcdbVehicle);
    this.addBodyConfiguration(vehicle, vcdbVehicle);
    this.addBrakeConfiguration(vehicle, vcdbVehicle);
  }

  /**
   * Enhance vehicle configuration by finding and adding VCdb relationships
   */
  async enhanceConfiguration(vehicle: StandardizedVehicle): Promise<StandardizedVehicle> {
    // Find the first matching VCdb vehicle for this base vehicle
    if (vehicle.vehicleId) {
      const vcdbVehicle = this.autoCareData.vcdb.vehicles.get(vehicle.vehicleId);
      if (vcdbVehicle) {
        this.enhanceVehicle(vehicle, vcdbVehicle);
      }
    } else if (vehicle.baseVehicleId) {
      // Find a vehicle that matches this base vehicle
      for (const [vehicleId, vcdbVehicle] of this.autoCareData.vcdb.vehicles) {
        if (vcdbVehicle.BaseVehicleID === vehicle.baseVehicleId) {
          vehicle.vehicleId = vehicleId;
          this.enhanceVehicle(vehicle, vcdbVehicle);
          break;
        }
      }
    }
    
    return vehicle;
  }

  /**
   * Add engine configuration information from VCdb relationships
   */
  addEngineConfiguration(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    const engineConfigs = this.autoCareData.vcdb.vehicleToEngineConfigs.get(vcdbVehicle.VehicleID);
    if (!engineConfigs || engineConfigs.length === 0) return;

    // Use the first engine configuration
    const vehicleToEngineConfig = engineConfigs[0];
    const engineConfig = this.autoCareData.vcdb.engineConfigs.get(vehicleToEngineConfig.EngineConfigID);
    
    if (!engineConfig) return;

    const engine: VehicleEngineInfo = {
      engineConfigId: vehicleToEngineConfig.EngineConfigID,
      engineBaseId: engineConfig.EngineBaseID
    };

    // Get engine base information
    const engineBase = this.autoCareData.vcdb.engineBases.get(engineConfig.EngineBaseID);
    if (engineBase) {
      // Basic engine information
      if (engineBase.Liter) {
        engine.displacement = Number(engineBase.Liter);
      }
      if (engineBase.CID) {
        engine.cid = Number(engineBase.CID);
      }
      if (engineBase.CC) {
        engine.cc = Number(engineBase.CC);
      }
      if (engineBase.Cylinders) {
        engine.cylinders = Number(engineBase.Cylinders);
      }
      if (engineBase.BlockType) {
        engine.blockType = engineBase.BlockType;
      }
      if (engineBase.EngineHeadType) {
        engine.headType = engineBase.EngineHeadType;
      }
      if (engineBase.FuelType) {
        engine.fuelType = engineBase.FuelType;
      }
      if (engineBase.Aspiration) {
        engine.aspiration = engineBase.Aspiration;
      }
      if (engineBase.CylinderHeadType) {
        engine.cylinderHeadType = engineBase.CylinderHeadType;
      }
      if (engineBase.FuelDeliveryType) {
        engine.fuelDeliveryType = engineBase.FuelDeliveryType;
      }
      if (engineBase.FuelDeliverySubType) {
        engine.fuelDeliverySubType = engineBase.FuelDeliverySubType;
      }
      if (engineBase.FuelSystemControlType) {
        engine.fuelSystemControlType = engineBase.FuelSystemControlType;
      }
      if (engineBase.FuelSystemDesign) {
        engine.fuelSystemDesign = engineBase.FuelSystemDesign;
      }
    }

    // Add engine manufacturing information
    if (engineConfig.EngineMfrID) {
      const engineMfr = this.autoCareData.vcdb.engineMfrs.get(engineConfig.EngineMfrID);
      if (engineMfr) {
        engine.manufacturer = engineMfr.EngineMfrName;
      }
    }

    // Add engine version
    if (engineConfig.EngineVersionID) {
      const version = this.autoCareData.vcdb.engineVersions.get(engineConfig.EngineVersionID);
      if (version) {
        engine.version = version.EngineVersionName;
      }
    }

    // Add power output
    if (engineConfig.PowerOutputID) {
      const powerOutput = this.autoCareData.vcdb.powerOutputs.get(engineConfig.PowerOutputID);
      if (powerOutput) {
        engine.powerOutput = powerOutput.PowerOutputName;
      }
    }

    // Add engine designation
    if (engineConfig.EngineDesignationID) {
      const designation = this.autoCareData.vcdb.engineDesignations.get(engineConfig.EngineDesignationID);
      if (designation) {
        engine.engineDesignation = designation.EngineDesignationName;
      }
    }

    // Add valve count
    if (engineConfig.ValvesID) {
      const valves = this.autoCareData.vcdb.valves.get(engineConfig.ValvesID);
      if (valves && valves.ValvesName) {
        const valveCount = parseInt(valves.ValvesName);
        if (!isNaN(valveCount)) {
          engine.valves = valveCount;
        }
      }
    }

    vehicle.engine = engine;
  }

  /**
   * Add transmission configuration information
   */
  addTransmissionConfiguration(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    const transmissions = this.autoCareData.vcdb.vehicleToTransmissions.get(vcdbVehicle.VehicleID);
    if (!transmissions || transmissions.length === 0) return;

    // Use the first transmission
    const vehicleToTransmission = transmissions[0];
    const transmission: VehicleTransmissionInfo = {
      transmissionId: vehicleToTransmission.TransmissionID
    };

    // Get transmission details
    const transmissionData = this.autoCareData.vcdb.transmissions.get(vehicleToTransmission.TransmissionID);
    if (transmissionData) {
      // Add transmission type
      if (transmissionData.TransmissionTypeID) {
        const transType = this.autoCareData.vcdb.transmissionTypes.get(transmissionData.TransmissionTypeID);
        if (transType) {
          transmission.type = transType.TransmissionTypeName;
        }
      }

      // Add number of speeds
      if (transmissionData.TransmissionNumSpeedsID) {
        const numSpeeds = this.autoCareData.vcdb.transmissionNumSpeeds.get(transmissionData.TransmissionNumSpeedsID);
        if (numSpeeds && numSpeeds.TransmissionNumSpeedsName) {
          const speeds = parseInt(numSpeeds.TransmissionNumSpeedsName);
          if (!isNaN(speeds)) {
            transmission.speeds = speeds.toString();
          }
        }
      }

      // Add transmission manufacturer
      if (transmissionData.TransmissionMfrID) {
        const transMfr = this.autoCareData.vcdb.transmissionMfrs.get(transmissionData.TransmissionMfrID);
        if (transMfr) {
          transmission.manufacturer = transMfr.TransmissionMfrName;
        }
      }

      // Add transmission base information
      if (transmissionData.TransmissionBaseID) {
        const transBase = this.autoCareData.vcdb.transmissionBases.get(transmissionData.TransmissionBaseID);
        if (transBase) {
          transmission.baseName = transBase.TransmissionBaseName;
        }
      }
    }

    // Get drive type
    const driveTypes = this.autoCareData.vcdb.vehicleToDriveTypes.get(vcdbVehicle.VehicleID);
    if (driveTypes && driveTypes.length > 0) {
      const driveType = this.autoCareData.vcdb.driveTypes.get(driveTypes[0].DriveTypeID);
      if (driveType) {
        transmission.driveType = driveType.DriveTypeName;
      }
    }

    vehicle.transmission = transmission;
  }

  /**
   * Add body configuration information
   */
  addBodyConfiguration(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    const bodyConfigs = this.autoCareData.vcdb.vehicleToBodyConfigs.get(vcdbVehicle.VehicleID);
    if (!bodyConfigs || bodyConfigs.length === 0) return;

    const bodyConfig = bodyConfigs[0];
    const body: VehicleBodyInfo = {};

    // Add body type
    if (bodyConfig.BodyTypeID) {
      const bodyType = this.autoCareData.vcdb.bodyTypes.get(bodyConfig.BodyTypeID);
      if (bodyType) {
        body.bodyType = bodyType.BodyTypeName;
      }
    }

    // Add door count
    if (bodyConfig.BodyNumDoorsID) {
      const doorCount = this.autoCareData.vcdb.bodyNumDoors.get(bodyConfig.BodyNumDoorsID);
      if (doorCount && doorCount.BodyNumDoorsName) {
        const doors = parseInt(doorCount.BodyNumDoorsName);
        if (!isNaN(doors)) {
          body.doors = doors;
        }
      }
    }

    // Add wheelbase
    const wheelbases = this.autoCareData.vcdb.vehicleToWheelbases.get(vcdbVehicle.VehicleID);
    if (wheelbases && wheelbases.length > 0) {
      const wheelbase = this.autoCareData.vcdb.wheelBases.get(wheelbases[0].WheelBaseID);
      if (wheelbase) {
        body.wheelbase = wheelbase.WheelBaseName;
      }
    }

    // Add bed type for trucks
    const bedConfigs = this.autoCareData.vcdb.vehicleToBedConfigs.get(vcdbVehicle.VehicleID);
    if (bedConfigs && bedConfigs.length > 0) {
      const bedConfig = bedConfigs[0];
      
      if (bedConfig.BedTypeID) {
        const bedType = this.autoCareData.vcdb.bedTypes.get(bedConfig.BedTypeID);
        if (bedType) {
          body.bedType = bedType.BedTypeName;
        }
      }

      if (bedConfig.BedLengthID) {
        const bedLength = this.autoCareData.vcdb.bedLengths.get(bedConfig.BedLengthID);
        if (bedLength) {
          body.bedLength = bedLength.BedLengthName;
        }
      }
    }

    if (Object.keys(body).length > 0) {
      vehicle.body = body;
    }
  }

  /**
   * Add brake configuration information
   */
  addBrakeConfiguration(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    const brakeConfigs = this.autoCareData.vcdb.vehicleToBrakeConfigs.get(vcdbVehicle.VehicleID);
    if (!brakeConfigs || brakeConfigs.length === 0) return;

    const brakeConfig = brakeConfigs[0];
    const brakes: VehicleBrakeInfo = {};

    // Add front brake type
    if (brakeConfig.FrontBrakeTypeID) {
      const frontBrakeType = this.autoCareData.vcdb.brakeTypes.get(brakeConfig.FrontBrakeTypeID);
      if (frontBrakeType) {
        brakes.frontBrakeType = frontBrakeType.BrakeTypeName;
      }
    }

    // Add rear brake type
    if (brakeConfig.RearBrakeTypeID) {
      const rearBrakeType = this.autoCareData.vcdb.brakeTypes.get(brakeConfig.RearBrakeTypeID);
      if (rearBrakeType) {
        brakes.rearBrakeType = rearBrakeType.BrakeTypeName;
      }
    }

    // Add ABS information
    if (brakeConfig.BrakeABSID) {
      const brakeABS = this.autoCareData.vcdb.brakeABS.get(brakeConfig.BrakeABSID);
      if (brakeABS) {
        brakes.abs = brakeABS.BrakeABSName === 'Yes' || brakeABS.BrakeABSName === 'True';
      }
    }

    // Add brake system type
    if (brakeConfig.BrakeSystemID) {
      const brakeSystem = this.autoCareData.vcdb.brakeSystems.get(brakeConfig.BrakeSystemID);
      if (brakeSystem) {
        brakes.brakeSystem = brakeSystem.BrakeSystemName;
      }
    }

    if (Object.keys(brakes).length > 0) {
      vehicle.brakes = brakes;
    }
  }

  /**
   * Add steering configuration information
   */
  addSteeringConfiguration(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    const steeringConfigs = this.autoCareData.vcdb.vehicleToSteeringConfigs.get(vcdbVehicle.VehicleID);
    if (!steeringConfigs || steeringConfigs.length === 0) return;

    const steeringConfig = steeringConfigs[0];
    
    // Add steering type
    if (steeringConfig.SteeringTypeID) {
      const steeringType = this.autoCareData.vcdb.steeringTypes.get(steeringConfig.SteeringTypeID);
      if (steeringType) {
        if (!vehicle.body) vehicle.body = {};
        vehicle.body.steeringType = steeringType.SteeringTypeName;
      }
    }

    // Add steering system
    if (steeringConfig.SteeringSystemID) {
      const steeringSystem = this.autoCareData.vcdb.steeringSystems.get(steeringConfig.SteeringSystemID);
      if (steeringSystem) {
        if (!vehicle.body) vehicle.body = {};
        vehicle.body.steeringSystem = steeringSystem.SteeringSystemName;
      }
    }
  }

  /**
   * Add spring configuration information
   */
  addSpringConfiguration(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    const springConfigs = this.autoCareData.vcdb.vehicleToSpringConfigs.get(vcdbVehicle.VehicleID);
    if (!springConfigs || springConfigs.length === 0) return;

    const springConfig = springConfigs[0];
    
    // Add front spring type
    if (springConfig.FrontSpringTypeID) {
      const frontSpringType = this.autoCareData.vcdb.springTypes.get(springConfig.FrontSpringTypeID);
      if (frontSpringType) {
        if (!vehicle.body) vehicle.body = {};
        vehicle.body.frontSuspension = frontSpringType.SpringTypeName;
      }
    }

    // Add rear spring type
    if (springConfig.RearSpringTypeID) {
      const rearSpringType = this.autoCareData.vcdb.springTypes.get(springConfig.RearSpringTypeID);
      if (rearSpringType) {
        if (!vehicle.body) vehicle.body = {};
        vehicle.body.rearSuspension = rearSpringType.SpringTypeName;
      }
    }
  }

  /**
   * Enhance vehicle with all available configurations including advanced ones
   */
  enhanceVehicleComplete(vehicle: StandardizedVehicle, vcdbVehicle: VCdbVehicle): void {
    this.enhanceVehicle(vehicle, vcdbVehicle);
    this.addSteeringConfiguration(vehicle, vcdbVehicle);
    this.addSpringConfiguration(vehicle, vcdbVehicle);
  }
}