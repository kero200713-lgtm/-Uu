"""Minimal glTF reader (numpy) used by the character texture painter."""
import json, os
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

class Gltf:
    def __init__(self, path):
        self.path = path
        self.d = json.load(open(path))
        base = os.path.dirname(path)
        self.buffers = [open(os.path.join(base, b['uri']), 'rb').read() for b in self.d['buffers']]

    def acc(self, i):
        a = self.d['accessors'][i]
        bv = self.d['bufferViews'][a['bufferView']]
        buf = self.buffers[bv['buffer']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        dt = CT[a['componentType']]; n = NC[a['type']]
        stride = bv.get('byteStride', 0)
        isz = np.dtype(dt).itemsize * n
        if stride and stride != isz:
            raw = np.frombuffer(buf, dtype=np.uint8, count=stride * (a['count'] - 1) + isz, offset=off)
            rows = np.lib.stride_tricks.as_strided(raw, shape=(a['count'], isz), strides=(stride, 1))
            arr = np.frombuffer(rows.copy().tobytes(), dtype=dt).reshape(a['count'], n)
        else:
            arr = np.frombuffer(buf, dtype=dt, count=a['count'] * n, offset=off).reshape(a['count'], n)
        arr = arr.astype(np.float32) if dt == np.float32 else arr
        if a.get('normalized'):
            arr = arr.astype(np.float32) / np.iinfo(dt).max
        return arr

    def node_by_name(self, name):
        for i, n in enumerate(self.d['nodes']):
            if n.get('name') == name: return i, n
        raise KeyError(name)

    def primitive(self, node_name):
        _, n = self.node_by_name(node_name)
        p = self.d['meshes'][n['mesh']]['primitives'][0]
        at = p['attributes']
        out = {k: self.acc(v) for k, v in at.items() if k in ('POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0')}
        out['indices'] = self.acc(p['indices']).reshape(-1, 3).astype(np.int64)
        skin = self.d['skins'][n['skin']]
        out['joint_names'] = [self.d['nodes'][j]['name'] for j in skin['joints']]
        ibm = self.acc(skin['inverseBindMatrices']).reshape(-1, 4, 4)
        # glTF stores column-major matrices
        out['joint_pos'] = {}
        for k, m in enumerate(ibm):
            M = np.linalg.inv(m.T)
            out['joint_pos'][out['joint_names'][k]] = M[:3, 3]
        return out
