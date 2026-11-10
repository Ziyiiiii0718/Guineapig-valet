import unittest
import numpy as np
from supervised import grouped_folds, make_model, select_model


class SupervisedTests(unittest.TestCase):
    def test_groups_never_overlap_and_cover_each_row(self):
        y=np.array([0,1,0,0,1,1]); groups=np.array(['a','a','b','b','c','c'])
        folds=grouped_folds(y,groups)
        for tr,va in folds:
            self.assertFalse(set(groups[tr]) & set(groups[va]))
            self.assertEqual(set(y[tr]),{0,1})
        self.assertEqual(sorted(np.concatenate([va for _,va in folds]).tolist()),list(range(6)))

    def test_missing_training_class_rejected(self):
        with self.assertRaises(ValueError):
            grouped_folds(np.array([0,0,1]), np.array(['a','b','c']))

    def test_validation_extreme_cannot_change_scaler(self):
        x=np.zeros((4,1024)); x[:2,:512]=1; x[2:,:512]=3
        x[:2,512:]=10; x[2:,512:]=30
        model=make_model('Combined-LR',.01).fit(x,np.array([0,0,1,1]))
        model.predict(np.full((1,1024),1e9))
        scales=model.named_steps['scale'].named_transformers_
        np.testing.assert_allclose(scales['clip'].mean_,2)
        np.testing.assert_allclose(scales['lab'].mean_,20)
        np.testing.assert_allclose(scales['clip'].scale_,1)
        np.testing.assert_allclose(scales['lab'].scale_,10)

    def test_regularization_tie_prefers_smallest(self):
        x=np.zeros((6,1024)); y=np.array([0,1,0,1,0,1]); groups=np.repeat(['a','b','c'],2)
        best, candidates, _=select_model(x,y,groups,'CLIP-LR')
        self.assertEqual(best['C'],.001)
        self.assertEqual(len(candidates),5)
