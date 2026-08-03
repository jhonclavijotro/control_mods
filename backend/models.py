from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Inverter(Base):
    __tablename__ = "inverters"

    id = Column(String, primary_key=True)  # e.g., A1, A2, B1, B2, C1, C2, D1, E1
    name = Column(String, nullable=False)
    max_modules = Column(Integer, nullable=False)  # 6 for A1-D1, 4 for E1

    slots = relationship("ModuleSlot", back_populates="inverter", cascade="all, delete-orphan")

class ModuleSlot(Base):
    __tablename__ = "module_slots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inverter_id = Column(String, ForeignKey("inverters.id"), nullable=False)
    slot_number = Column(Integer, nullable=False)  # 1..6 or 1..4
    current_serial = Column(String, nullable=True)  # Current power module serial installed
    installed_at = Column(DateTime, default=datetime.utcnow)

    inverter = relationship("Inverter", back_populates="slots")

class PowerModule(Base):
    __tablename__ = "power_modules"

    serial_number = Column(String, primary_key=True)
    current_inverter_id = Column(String, nullable=True)  # Current Inverter ID if installed
    current_slot_number = Column(Integer, nullable=True)  # Current Slot number if installed
    status = Column(String, default="operating")  # operating, in_repair, spare, retired
    registered_at = Column(DateTime, default=datetime.utcnow)
    total_repairs = Column(Integer, default=0)

class RepairLog(Base):
    __tablename__ = "repair_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    serial_number = Column(String, nullable=False)
    inverter_id = Column(String, nullable=False)
    slot_number = Column(Integer, nullable=False)
    stop_time = Column(DateTime, nullable=False)
    restart_time = Column(DateTime, nullable=True)  # Null if currently in repair
    reason = Column(Text, nullable=False)
    diagnosis = Column(Text, nullable=True)
    status = Column(String, default="open")  # open, resolved
    attachment_path = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)

class ReplacementLog(Base):
    __tablename__ = "replacement_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inverter_id = Column(String, nullable=False)
    slot_number = Column(Integer, nullable=False)
    old_serial = Column(String, nullable=False)
    new_serial = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    reason = Column(Text, nullable=False)
    performed_by = Column(String, default="Técnico Solar")
    attachment_path = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
