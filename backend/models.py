from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float, Text, Index, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
try:
    from .database import Base
except ImportError:
    from database import Base

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="operator", index=True)  # admin, operator, stakeholder
    created_at = Column(DateTime, default=utc_now)
    is_active = Column(Boolean, default=True)

class Inverter(Base):
    __tablename__ = "inverters"

    id = Column(String, primary_key=True)  # e.g., A1, A2, B1, B2, C1, C2, D1, E1
    name = Column(String, nullable=False)
    max_modules = Column(Integer, nullable=False)  # 6 for A1-D1, 4 for E1

    slots = relationship("ModuleSlot", back_populates="inverter", cascade="all, delete-orphan")

class ModuleSlot(Base):
    __tablename__ = "module_slots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inverter_id = Column(String, ForeignKey("inverters.id"), nullable=False, index=True)
    slot_number = Column(Integer, nullable=False)  # 1..6 or 1..4
    current_serial = Column(String, nullable=True, index=True)  # Current power module serial installed
    installed_at = Column(DateTime, default=utc_now)

    inverter = relationship("Inverter", back_populates="slots")

class PowerModule(Base):
    __tablename__ = "power_modules"

    serial_number = Column(String, primary_key=True)
    current_inverter_id = Column(String, nullable=True, index=True)  # Current Inverter ID if installed
    current_slot_number = Column(Integer, nullable=True)  # Current Slot number if installed
    status = Column(String, default="operating", index=True)  # operating, in_repair, spare, retired
    registered_at = Column(DateTime, default=utc_now)
    total_repairs = Column(Integer, default=0)

class RepairLog(Base):
    __tablename__ = "repair_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    serial_number = Column(String, nullable=False, index=True)
    inverter_id = Column(String, nullable=False, index=True)
    slot_number = Column(Integer, nullable=False)
    stop_time = Column(DateTime, nullable=False)
    restart_time = Column(DateTime, nullable=True)  # Null if currently in repair
    reason = Column(Text, nullable=False)
    diagnosis = Column(Text, nullable=True)
    status = Column(String, default="open", index=True)  # open, resolved
    attachment_path = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)

class ReplacementLog(Base):
    __tablename__ = "replacement_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inverter_id = Column(String, nullable=False, index=True)
    slot_number = Column(Integer, nullable=False)
    old_serial = Column(String, nullable=False, index=True)
    new_serial = Column(String, nullable=False, index=True)
    timestamp = Column(DateTime, default=utc_now)
    reason = Column(Text, nullable=False)
    performed_by = Column(String, default="Técnico Solar")
    attachment_path = Column(String, nullable=True)
    attachment_name = Column(String, nullable=True)
